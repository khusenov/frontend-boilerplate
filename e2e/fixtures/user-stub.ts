// UserWireRecord is a pinned copy of the backend's /v1/users/{id} contract — deliberately NOT
// imported from src/entities/user/api/user-dto.ts. If the two disagree, one of them is wrong, and
// finding that out is the entire purpose of this suite. Do not DRY this away.

import type { Route } from '@playwright/test';

import {
  BAD_REQUEST_STATUS,
  NO_CONTENT_STATUS,
  NOT_FOUND_STATUS,
  OK_STATUS,
} from './http-contract';

export type UserRoleWireValue = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface UserWireRecord {
  readonly id: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
  readonly role: UserRoleWireValue;
  readonly created_at: string;
}

export interface UserNameWirePatch {
  readonly first_name: string;
  readonly last_name: string;
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

const USER_RESOURCE_PATTERN = /^\/v1\/users\/(?<userId>[^/]+)$/u;

const READ_METHOD = 'GET';
const UPDATE_METHOD = 'PATCH';

const NO_SUCH_USER_MESSAGE = 'No such user.';
const REJECTED_MESSAGE = 'The name update was rejected.';

function toUserId(pathname: string): string | undefined {
  const rawUserId = USER_RESOURCE_PATTERN.exec(pathname)?.groups?.userId;

  return rawUserId === undefined ? undefined : decodeURIComponent(rawUserId);
}

function isNamePatch(value: unknown): value is UserNameWirePatch {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<keyof UserNameWirePatch, unknown>>;

  return typeof candidate.first_name === 'string' && typeof candidate.last_name === 'string';
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

  async function explain(route: Route, status: number, message: string): Promise<void> {
    await route.fulfill({ status, json: { message } });
  }

  async function readUser(route: Route, record: UserWireRecord | undefined): Promise<void> {
    if (record === undefined) {
      await explain(route, NOT_FOUND_STATUS, NO_SUCH_USER_MESSAGE);
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
      await explain(route, NOT_FOUND_STATUS, NO_SUCH_USER_MESSAGE);
      return;
    }

    const rawBody = route.request().postData();
    const patch = readNamePatch(rawBody);

    if (patch === undefined) {
      await explain(
        route,
        BAD_REQUEST_STATUS,
        `Expected a body of { first_name, last_name }, received: ${rawBody ?? 'no body'}.`,
      );
      return;
    }

    receivedNamePatches.push(patch);

    const injectedFailureStatus = takeInjectedFailureStatus();

    if (injectedFailureStatus !== undefined) {
      await explain(route, injectedFailureStatus, REJECTED_MESSAGE);
      return;
    }

    records.set(userId, {
      ...record,
      first_name: patch.first_name,
      last_name: patch.last_name,
    });

    await route.fulfill({ status: NO_CONTENT_STATUS });
  }

  async function handle(route: Route): Promise<void> {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const userId = toUserId(pathname);

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
