const root = document.documentElement;
const MEGA_CLOSE_MS = 250;
const megaTimers = new WeakMap<HTMLElement, number>();

function toast(message: string) {
  const region = document.getElementById('toaster');
  if (!region) return;
  region.hidden = false;
  region.textContent = message;
  window.setTimeout(() => {
    region.hidden = true;
  }, 3200);
}

function applyReader(next: { discreet?: boolean; blur?: boolean }) {
  if (typeof next.discreet === 'boolean') {
    root.classList.toggle('is-discreet', next.discreet);
    root.dataset.discreet = next.discreet ? '1' : '0';
    const real = document.querySelector('meta[name="pulse:title"]')?.getAttribute('content') || 'PulseNSFW';
    document.title = next.discreet ? 'Notes' : real;
    const icon = document.getElementById('favicon') as HTMLLinkElement | null;
    if (icon) icon.href = next.discreet ? '/favicon-discreet.svg' : '/favicon.svg';
    const word = document.querySelector('.logo-word');
    if (word) word.textContent = next.discreet ? 'Notes' : 'PULSE';
    const sub = document.querySelector('.logo-sub') as HTMLElement | null;
    if (sub) sub.hidden = next.discreet;
  }
  if (typeof next.blur === 'boolean') {
    root.classList.toggle('is-blur', next.blur);
    root.dataset.blur = next.blur ? '1' : '0';
  }
}

async function postForm(form: HTMLFormElement): Promise<boolean> {
  const response = await fetch(form.action, {
    method: 'POST',
    body: new FormData(form),
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { discreet?: boolean; blur?: boolean; nsfw?: boolean; reload?: boolean };
  applyReader(data);
  if (data.reload) window.location.reload();
  return true;
}

function openDialog(id: string) {
  const dialog = document.getElementById(id);
  if (!dialog) return;
  dialog.hidden = false;
  const input = dialog.querySelector('input, button');
  if (input instanceof HTMLElement) input.focus();
}

function closeDialog(dialog: HTMLElement) {
  dialog.hidden = true;
}

function megaItem(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const item = node.closest('[data-mega]');
  return item instanceof HTMLElement ? item : null;
}

function megaTrigger(item: HTMLElement): HTMLElement | null {
  const trigger = item.querySelector('[data-mega-trigger]');
  return trigger instanceof HTMLElement ? trigger : null;
}

function clearMegaTimer(item: HTMLElement) {
  const timer = megaTimers.get(item);
  if (timer) window.clearTimeout(timer);
  megaTimers.delete(item);
}

function openMega(item: HTMLElement, focusFirst = false) {
  document.querySelectorAll<HTMLElement>('[data-mega].is-open').forEach((other) => {
    if (other !== item) closeMega(other, false);
  });
  clearMegaTimer(item);
  item.classList.add('is-open');
  megaTrigger(item)?.setAttribute('aria-expanded', 'true');
  if (focusFirst) {
    const first = item.querySelector('.mega a');
    if (first instanceof HTMLElement) first.focus();
  }
}

function closeMega(item: HTMLElement, restoreFocus: boolean) {
  clearMegaTimer(item);
  item.classList.remove('is-open');
  const trigger = megaTrigger(item);
  trigger?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) trigger?.focus();
}

function scheduleMegaClose(item: HTMLElement) {
  clearMegaTimer(item);
  const timer = window.setTimeout(() => closeMega(item, false), MEGA_CLOSE_MS);
  megaTimers.set(item, timer);
}

function closeOpenMegas(except?: HTMLElement | null) {
  document.querySelectorAll<HTMLElement>('[data-mega].is-open').forEach((item) => {
    if (item !== except) closeMega(item, false);
  });
}

function onClick(event: MouseEvent) {
  const target = event.target as Element | null;
  if (!target) return;

  const search = target.closest('[data-search-open]');
  if (search) {
    event.preventDefault();
    openDialog('search-dialog');
    return;
  }

  const opener = target.closest('[data-open-dialog]');
  if (opener instanceof HTMLElement && opener.dataset.openDialog) {
    openDialog(opener.dataset.openDialog);
    return;
  }

  const closer = target.closest('[data-close-dialog]');
  if (closer) {
    closer.closest('.modal')?.setAttribute('hidden', '');
    const modal = closer.closest('.modal');
    if (modal instanceof HTMLElement) closeDialog(modal);
    return;
  }

  const toastButton = target.closest('[data-toast]');
  if (toastButton instanceof HTMLElement && toastButton.dataset.toast) {
    toast(toastButton.dataset.toast);
  }

  const tab = target.closest('[role="tab"]');
  if (tab instanceof HTMLButtonElement) {
    const rootTabs = tab.closest('[data-tabs]');
    if (!rootTabs) return;
    const id = tab.dataset.tab;
    rootTabs.querySelectorAll('[role="tab"]').forEach((button) => {
      button.setAttribute('aria-selected', button === tab ? 'true' : 'false');
    });
    rootTabs.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      panel.hidden = panel.dataset.panel !== id;
    });
    return;
  }

  const prev = target.closest('[data-carousel-prev]');
  const next = target.closest('[data-carousel-next]');
  if (prev || next) {
    const id = (prev ?? next)?.getAttribute('data-carousel-target');
    const scroller = id ? document.getElementById(id) : null;
    scroller?.scrollBy({ left: (next ? 1 : -1) * Math.min(scroller.clientWidth * 0.8, 360), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  document.querySelectorAll('details.menu[open]').forEach((menu) => {
    if (!menu.contains(target)) menu.removeAttribute('open');
  });
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

document.addEventListener('pointerover', (event) => {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  const item = megaItem(event.target);
  if (!item) return;
  openMega(item);
});

document.addEventListener('pointerout', (event) => {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  const item = megaItem(event.target);
  if (!item) return;
  const next = event.relatedTarget;
  if (next instanceof Node && item.contains(next)) return;
  scheduleMegaClose(item);
});

document.addEventListener('focusout', (event) => {
  const item = megaItem(event.target);
  if (!item || !item.classList.contains('is-open')) return;
  const next = event.relatedTarget;
  if (next instanceof Node && item.contains(next)) return;
  scheduleMegaClose(item);
});

document.addEventListener('focusin', (event) => {
  const item = megaItem(event.target);
  if (!item) return;
  clearMegaTimer(item);
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const trigger = target.closest('[data-mega-trigger]');
  if (trigger instanceof HTMLElement) {
    const item = trigger.closest('[data-mega]');
    if (!(item instanceof HTMLElement)) return;
    if (!item.classList.contains('is-open')) {
      event.preventDefault();
      event.stopPropagation();
      openMega(item);
    }
    return;
  }
  if (!target.closest('[data-mega]')) closeOpenMegas();
}, true);

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('[data-search-open]')) return;
  event.preventDefault();
  event.stopPropagation();
  openDialog('search-dialog');
}, true);

document.addEventListener('click', onClick);

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'nsfw-toggle') {
    event.preventDefault();
    void postForm(form).then((ok) => {
      if (!ok) toast('NSFW mode stays off until age verification passes.');
    });
    return;
  }
  if (form.hasAttribute('data-pref-form')) {
    event.preventDefault();
    const data = new FormData(form);
    void postForm(form).then((ok) => {
      if (!ok) {
        HTMLFormElement.prototype.submit.call(form);
        return;
      }
      toast('Saved on this browser.');
      const discreet = data.get('discreet');
      const blur = data.get('blur');
      if (discreet === '0' || discreet === '1') {
        const button = form.querySelector('button');
        if (button) button.textContent = `Discreet mode ${discreet === '1' ? 'on' : 'off'}`;
      }
      if (blur === '0' || blur === '1') {
        const button = form.querySelector('button');
        if (button) button.textContent = `Blur ${blur === '1' ? 'on' : 'off'}`;
      }
    });
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  if (event.key === 'Escape') {
    const openMegaItem = document.querySelector('[data-mega].is-open');
    if (openMegaItem instanceof HTMLElement) {
      event.preventDefault();
      closeMega(openMegaItem, true);
    }
    document.querySelectorAll('.modal:not([hidden])').forEach((node) => {
      if (node instanceof HTMLElement && node.id !== '') closeDialog(node);
    });
  }
  if ((event.key === 'Enter' || event.key === ' ') && target instanceof HTMLElement) {
    const trigger = target.closest('[data-mega-trigger]');
    if (trigger instanceof HTMLElement && document.activeElement === trigger) {
      const item = trigger.closest('[data-mega]');
      if (item instanceof HTMLElement && !item.classList.contains('is-open')) {
        event.preventDefault();
        openMega(item, true);
      } else if (event.key === ' ' && item instanceof HTMLElement) {
        event.preventDefault();
        trigger.click();
      }
    }
  }
  if (event.key === 'H' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea');
    if (typing) return;
    event.preventDefault();
    const hidden = root.classList.contains('is-discreet') || root.classList.contains('is-blur');
    const body = new URLSearchParams();
    body.set('discreet', hidden ? '0' : '1');
    body.set('blur', hidden ? '0' : '1');
    body.set('return', location.pathname);
    applyReader({ discreet: !hidden, blur: !hidden });
    void fetch('/api/reader/prefs', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin',
    });
  }
});

function bindCarousels() {
  document.querySelectorAll<HTMLElement>('[data-carousel]').forEach((scroller) => {
    const id = scroller.id;
    const prev = document.querySelector(`[data-carousel-prev][data-carousel-target="${id}"]`);
    const next = document.querySelector(`[data-carousel-next][data-carousel-target="${id}"]`);
    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth - 4;
      if (prev instanceof HTMLButtonElement) prev.disabled = scroller.scrollLeft <= 4;
      if (next instanceof HTMLButtonElement) next.disabled = scroller.scrollLeft >= max;
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
  });
}

document.addEventListener('astro:page-load', () => {
  root.classList.add('js');
  bindCarousels();
});

root.classList.add('js');
bindCarousels();
