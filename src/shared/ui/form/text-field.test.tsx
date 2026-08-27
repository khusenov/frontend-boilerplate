import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './use-app-form';

const MINIMUM_PASSWORD_LENGTH = 8;

const signInSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(MINIMUM_PASSWORD_LENGTH, 'Use at least 8 characters')
    .regex(/[0-9]/, 'Include a digit'),
});

interface SignInHarnessProps {
  readonly description?: string | undefined;
  readonly onSubmit?: ((value: { email: string; password: string }) => void) | undefined;
}

function SignInHarness({ description, onSubmit }: SignInHarnessProps) {
  const form = useAppForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: signInSchema },
    onSubmit: ({ value }) => {
      onSubmit?.(value);
    },
  });

  return (
    <form.AppForm>
      <form.Form aria-label="Sign in">
        <form.AppField name="email">
          {(field) => <field.TextField description={description} label="Email" type="email" />}
        </form.AppField>
        <form.AppField name="password">
          {(field) => <field.TextField label="Password" type="password" />}
        </form.AppField>
        <form.SubmitButton>Sign in</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

function OptionalValueHarness({ nickname }: { readonly nickname: string | null | undefined }) {
  const form = useAppForm({ defaultValues: { nickname } });

  return (
    <form.AppForm>
      <form.AppField name="nickname">
        {(field) => <field.TextField label="Nickname" />}
      </form.AppField>
    </form.AppForm>
  );
}

function NumericFieldHarness() {
  const form = useAppForm({ defaultValues: { age: 42 } });

  return (
    <form.AppForm>
      <form.AppField name="age">{(field) => <field.TextField label="Age" />}</form.AppField>
    </form.AppForm>
  );
}

describe('TextField', () => {
  it('makes the control reachable by its label text', () => {
    render(<SignInHarness />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('describes nothing and claims validity while untouched', () => {
    render(<SignInHarness />);

    const email = screen.getByLabelText('Email');
    expect(email).not.toHaveAttribute('aria-describedby');
    expect(email).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders a description and links it to the control', () => {
    render(<SignInHarness description="We never share it." />);

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('We never share it.');
  });

  it('stays silent while an invalid value is still being typed', async () => {
    const user = userEvent.setup();
    render(<SignInHarness />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
  });

  it('reveals the schema message on blur and links it alongside the description', async () => {
    const user = userEvent.setup();
    render(<SignInHarness description="We never share it." />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab();

    const email = screen.getByLabelText('Email');
    await waitFor(() => {
      expect(email).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(email).toHaveAccessibleDescription('We never share it. Enter a valid email address');
  });

  it('reveals every field error when submit is pressed without touching anything', async () => {
    const user = userEvent.setup();
    render(<SignInHarness />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders one list item per simultaneous validation failure', async () => {
    const user = userEvent.setup();
    render(<SignInHarness />);

    await user.type(screen.getByLabelText('Password'), 'short');
    await user.tab();

    const alert = await screen.findByRole('alert');
    const messages = within(alert)
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(messages).toEqual(['Use at least 8 characters', 'Include a digit']);
  });

  it('clears the alert once the value is corrected', async () => {
    const user = userEvent.setup();
    render(<SignInHarness />);

    const email = screen.getByLabelText('Email');
    await user.type(email, 'not-an-email');
    await user.tab();
    await screen.findByRole('alert');

    await user.clear(email);
    await user.type(email, 'ada@example.com');

    await waitFor(() => {
      expect(email).toHaveAttribute('aria-invalid', 'false');
    });
    expect(email).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument();
  });

  it('submits the typed values once every field is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SignInHarness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct1horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct1horse',
      });
    });
  });

  it('renders an empty control for a field defaulting to undefined', () => {
    render(<OptionalValueHarness nickname={undefined} />);

    expect(screen.getByLabelText('Nickname')).toHaveValue('');
  });

  it('renders an empty control for a field defaulting to null', () => {
    render(<OptionalValueHarness nickname={null} />);

    expect(screen.getByLabelText('Nickname')).toHaveValue('');
  });

  it('throws a TypeError naming the field when bound to a non-string value', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => {
      render(<NumericFieldHarness />);
    }).toThrow(new TypeError('TextField requires a string field, but "age" holds number.'));
  });
});
