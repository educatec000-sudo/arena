import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Captura o evento de instalação do PWA (o mesmo botão 📲 do app original).
 * O evento só existe em navegadores compatíveis e só quando o app ainda não
 * está instalado — por isso o botão simplesmente não aparece na maioria dos
 * casos de desktop.
 */
export function usePwaInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setEvent(null));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    return choice.outcome === 'accepted';
  };

  return { canInstall: Boolean(event), install };
}

export default usePwaInstall;
