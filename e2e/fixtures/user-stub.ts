// UserWireRecord is a pinned copy of the backend's /v1/users/{id} contract — deliberately NOT
// imported from src/entities/user/api/user-dto.ts. If the two disagree, one of them is wrong, and
// finding that out is the entire purpose of this suite. Do not DRY this away.

import type { Route } from '@playwright/test';

import { API_PREFIX, BAD_REQUEST_STATUS, NOT_FOUND_STATUS, OK_STATUS } from './http-contract';

type UserStatusWireValue = 'active' | 'inactive' | 'pending';

export interface UserWireRecord {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly email: string;
  readonly status: UserStatusWireValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserNameWirePatch {
  readonly firstName: string;
  readonly lastName: string;
}

export interface UserStub {
  readonly seed: (record: UserWireRecord) => void;
  readonly failNextNameUpdate: (status: number) => void;
  readonly namePatches: () => readonly UserNameWirePatch[];
}

export interface UserStubRegistration {
  readonly stub: UserStub;
  readonly handle: (route: Route) => Promise<void>;
}

interface WireError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

const USER_RESOURCE_PATTERN = new RegExp(`^${API_PREFIX}/users/(?<userId>[^/]+)$`, 'u');

const READ_METHOD = 'GET';
const UPDATE_METHOD = 'PATCH';

const STUB_REQUEST_ID = 'e2e-user-stub';

const NO_SUCH_USER: WireError = {
  status: NOT_FOUND_STATUS,
  code: 'USER_NOT_FOUND',
  message: 'No such user.',
};

function toMalformedPatchError(rawBody: string | null): WireError {
  return {
    status: BAD_REQUEST_STATUS,
    code: 'VALIDATION',
    message: `Expected a body of { firstName, lastName }, received: ${rawBody ?? 'no body'}.`,
  };
}

function toInjectedFailure(status: number): WireError {
  return {
    status,
    code: 'E2E_INJECTED_FAILURE',
    message: 'The name update was rejected.',
  };
}

async function fulfillWithError(route: Route, { status, code, message }: WireError): Promise<void> {
  await route.fulfill({ status, json: { error: { code, message, requestId: STUB_REQUEST_ID } } });
}

function readUserIdFromPath(pathname: string): string | undefined {
  const rawUserId = USER_RESOURCE_PATTERN.exec(pathname)?.groups?.userId;

  return rawUserId === undefined ? undefined : decodeURIComponent(rawUserId);
}

function isNamePatch(value: unknown): value is UserNameWirePatch {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof UserNameWirePatch, unknown>>;

  return typeof candidate.firstName === 'string' && typeof candidate.lastName === 'string';
}

function readNamePatch(rawBody: string | null): UserNameWirePatch | undefined {
  if (rawBody === null) {
    return undefined;
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;

    return isNamePatch(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function toRenamedRecord(record: UserWireRecord, patch: UserNameWirePatch): UserWireRecord {
  return {
    ...record,
    firstName: patch.firstName,
    lastName: patch.lastName,
    fullName: `${patch.firstName} ${patch.lastName}`,
    updatedAt: new Date().toISOString(),
  };
}

export function createUserStub(): UserStubRegistration {
  const records = new Map<string, UserWireRecord>();
  const receivedNamePatches: UserNameWirePatch[] = [];
  let nextNameUpdateFailureStatus: number | undefined;

  const stub: UserStub = {
    seed: (record) => {
      records.set(record.id, record);
    },
    failNextNameUpdate: (status) => {
      nextNameUpdateFailureStatus = status;
    },
    namePatches: () => [...receivedNamePatches],
  };

  function takeInjectedFailureStatus(): number | undefined {
    const status = nextNameUpdateFailureStatus;
    nextNameUpdateFailureStatus = undefined;

    return status;
  }

  async function readUser(route: Route, record: UserWireRecord | undefined): Promise<void> {
    if (record === undefined) {
      await fulfillWithError(route, NO_SUCH_USER);
      return;
    }

    await route.fulfill({ status: OK_STATUS, json: record });
  }

  async function updateUserName(
    route: Route,
    userId: string,
    record: UserWireRecord | undefined,
  ): Promise<void> {
    if (record === undefined) {
      await fulfillWithError(route, NO_SUCH_USER);
      return;
    }

    const rawBody = route.request().postData();
    const patch = readNamePatch(rawBody);

    if (patch === undefined) {
      await fulfillWithError(route, toMalformedPatchError(rawBody));
      return;
    }

    receivedNamePatches.push(patch);

    const injectedFailureStatus = takeInjectedFailureStatus();

    if (injectedFailureStatus !== undefined) {
      await fulfillWithError(route, toInjectedFailure(injectedFailureStatus));
      return;
    }

    const renamedRecord = toRenamedRecord(record, patch);

    records.set(userId, renamedRecord);

    await route.fulfill({ status: OK_STATUS, json: renamedRecord });
  }

  async function handle(route: Route): Promise<void> {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const userId = readUserIdFromPath(pathname);

    if (userId === undefined) {
      await route.fallback();
      return;
    }

    const method = request.method();
    const record = records.get(userId);

    if (method === READ_METHOD) {
      await readUser(route, record);
      return;
    }

    if (method === UPDATE_METHOD) {
      await updateUserName(route, userId, record);
      return;
    }

    await route.fallback();
  }

  return { stub, handle };
}
