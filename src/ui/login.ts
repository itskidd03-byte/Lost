export interface LoginHandlers {
  onLogin(username: string, pin: string): Promise<string | null>;
  onCreate(username: string, pin: string): Promise<string | null>;
}

/**
 * Device-local sign-in screen. It returns only an error string, so the game
 * decides when a profile is fully ready and the island can be resumed.
 */
export class LoginScreen {
  private root: HTMLElement;
  private handlers: LoginHandlers | null = null;
  private mode: 'login' | 'create' = 'login';
  private error = '';
  private busy = false;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(usernames: string[], hasExistingIsland: boolean, lastUsername: string, handlers: LoginHandlers): void {
    this.handlers = handlers;
    this.mode = usernames.length ? 'login' : 'create';
    this.error = '';
    this.busy = false;
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="login-card">
        <div class="login-crest">✦</div>
        <p class="login-kicker">A living world, kept on this device</p>
        <h1>KINGDOMS OF THE<br/><span>FORGOTTEN ISLAND</span></h1>
        <p class="login-lede">Sign in to your own island. Every autosave belongs to this profile, so a different player can use the game without touching your progress.</p>
        ${hasExistingIsland ? '<p class="login-migrate">An existing island was found. It will move into the first profile you sign in with, with its world and day intact.</p>' : ''}
        <div class="login-tabs">
          <button type="button" data-login-mode="login" class="${this.mode === 'login' ? 'active' : ''}" ${usernames.length ? '' : 'disabled'}>Sign in</button>
          <button type="button" data-login-mode="create" class="${this.mode === 'create' ? 'active' : ''}">Create profile</button>
        </div>
        <form id="login-form" autocomplete="on">
          <label class="login-field">Username
            <input id="login-username" name="username" type="text" maxlength="24" required autocomplete="username" spellcheck="false" list="login-names" value="${this.escape(lastUsername)}" />
          </label>
          <datalist id="login-names">${usernames.map((name) => `<option value="${this.escape(name)}"></option>`).join('')}</datalist>
          <label class="login-field">PIN <small>4–8 digits</small>
            <input id="login-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" required autocomplete="current-password" />
          </label>
          <label class="login-field" id="login-confirm-wrap" ${this.mode === 'create' ? '' : 'hidden'}>Confirm PIN
            <input id="login-confirm" name="confirm" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="8" autocomplete="new-password" />
          </label>
          <p class="login-error" id="login-error" role="alert"></p>
          <button class="primary login-submit" id="login-submit" type="submit">${this.mode === 'login' ? 'Sign in and continue' : 'Create profile and play'}</button>
        </form>
        <p class="fineprint">Profiles, PIN hashes and saves stay in this browser. This is not a server account; it keeps separate players’ autosaves apart.</p>
      </div>
    `;
    this.bind();
    (document.getElementById('login-username') as HTMLInputElement | null)?.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.handlers = null;
  }

  private escape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLElement>('[data-login-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        if (this.busy) return;
        const mode = button.dataset.loginMode as 'login' | 'create';
        if (mode === this.mode) return;
        this.mode = mode;
        this.error = '';
        this.root.querySelectorAll<HTMLElement>('[data-login-mode]').forEach((entry) => {
          entry.classList.toggle('active', entry.dataset.loginMode === mode);
        });
        const confirm = document.getElementById('login-confirm-wrap') as HTMLElement | null;
        if (confirm) confirm.hidden = mode !== 'create';
        const pin = document.getElementById('login-pin') as HTMLInputElement | null;
        const confirmPin = document.getElementById('login-confirm') as HTMLInputElement | null;
        if (pin) pin.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
        if (confirmPin) confirmPin.required = mode === 'create';
        const submit = document.getElementById('login-submit');
        if (submit) submit.textContent = mode === 'login' ? 'Sign in and continue' : 'Create profile and play';
        this.showError('');
      });
    });

    document.getElementById('login-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
  }

  private showError(message: string): void {
    this.error = message;
    const el = document.getElementById('login-error');
    if (el) el.textContent = message;
  }

  private async submit(): Promise<void> {
    if (this.busy || !this.handlers) return;
    const username = (document.getElementById('login-username') as HTMLInputElement | null)?.value ?? '';
    const pin = (document.getElementById('login-pin') as HTMLInputElement | null)?.value ?? '';
    const confirm = (document.getElementById('login-confirm') as HTMLInputElement | null)?.value ?? '';
    if (this.mode === 'create' && pin !== confirm) {
      this.showError('The PINs do not match.');
      return;
    }
    this.busy = true;
    this.showError('');
    const submit = document.getElementById('login-submit') as HTMLButtonElement | null;
    if (submit) {
      submit.disabled = true;
      submit.textContent = this.mode === 'login' ? 'Signing in…' : 'Creating profile…';
    }
    let error: string | null = null;
    try {
      error = this.mode === 'login'
        ? await this.handlers.onLogin(username, pin)
        : await this.handlers.onCreate(username, pin);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'The profile could not be opened.';
    }
    this.busy = false;
    if (error) {
      this.showError(error);
      if (submit) {
        submit.disabled = false;
        submit.textContent = this.mode === 'login' ? 'Sign in and continue' : 'Create profile and play';
      }
    }
  }
}
