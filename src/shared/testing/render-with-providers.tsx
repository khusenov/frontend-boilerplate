import { render, renderHook } from '@testing-library/react';
import type {
  RenderHookOptions,
  RenderHookResult,
  RenderOptions,
  RenderResult,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Options as UserEventOptions, UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';

import { createTestHarness, splitHarnessOptions } from './create-test-harness';
import type { TestHarnessCollaborators, TestHarnessDependencies } from './create-test-harness';

export interface RenderWithProvidersOptions
  extends Omit<RenderOptions, 'wrapper'>, TestHarnessDependencies {
  readonly userEventOptions?: UserEventOptions | undefined;
}

export interface RenderWithProvidersResult extends RenderResult, TestHarnessCollaborators {
  readonly user: UserEvent;
}

export interface RenderHookWithProvidersOptions<TProps>
  extends Omit<RenderHookOptions<TProps>, 'wrapper'>, TestHarnessDependencies {}

export interface RenderHookWithProvidersResult<TResult, TProps>
  extends RenderHookResult<TResult, TProps>, TestHarnessCollaborators {}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const { dependencies, rest } = splitHarnessOptions(options);
  const { userEventOptions, ...renderOptions } = rest;
  const { wrapper, ...collaborators } = createTestHarness(dependencies);
  const user = userEvent.setup(userEventOptions);

  return { ...render(ui, { ...renderOptions, wrapper }), ...collaborators, user };
}

export function renderHookWithProviders<TResult, TProps>(
  hook: (initialProps: TProps) => TResult,
  options: RenderHookWithProvidersOptions<TProps> = {},
): RenderHookWithProvidersResult<TResult, TProps> {
  const { dependencies, rest } = splitHarnessOptions(options);
  const { wrapper, ...collaborators } = createTestHarness(dependencies);

  return { ...renderHook(hook, { ...rest, wrapper }), ...collaborators };
}
