import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> { await this.page.goto(process.env.LOGIN_PATH ?? '/login'); }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel(process.env.LOGIN_EMAIL_LABEL ?? 'Email').fill(email);
    await this.page.getByLabel(process.env.LOGIN_PASSWORD_LABEL ?? 'Password').fill(password);
    await this.page.getByRole('button', { name: process.env.LOGIN_SUBMIT_NAME ?? 'Sign in' }).click();
  }

  async expectPasswordMasked(): Promise<void> {
    await expect(this.page.getByLabel(process.env.LOGIN_PASSWORD_LABEL ?? 'Password')).toHaveAttribute('type', 'password');
  }
}
