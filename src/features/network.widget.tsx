
import {
  Show,
  Switch,
  Match,
  createSignal,
  createEffect,
  onCleanup,
} from 'solid-js';

import * as zebar from 'zebar';
import { useProviders } from '../providers';

interface NetDetails {
  name: string;
  alias: string;
  connectivity: string;
  speed: string;
}

type NetworkType = 'wifi' | 'ethernet' | 'disconnected';

export const Network = () => {
  const providers = useProviders();

  const [netDetails, setNetDetails] =
    createSignal<NetDetails | null>(null);

  let fetching = false;
  let mounted = true;

  // --------------------------------------------------
  // Network tooltip communication.
  // --------------------------------------------------

  const tooltipChannel = new BroadcastChannel(
    'rose-pine-network-tooltip'
  );

  let tooltipOpened = false;
  let pointerOnIcon = false;
  let pointerOnPopup = false;

  let latestTooltipText = '';

  let tooltipHideTimer:
    | ReturnType<typeof setTimeout>
    | undefined;

  const clearTooltipHideTimer = () => {
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = undefined;
    }
  };

  const getNetworkInfo = () => {
    const net = providers.network;
    const details = netDetails();

    if (!net) {
      return {
        type: 'disconnected' as NetworkType,
        tooltip: 'Disconnected\nNo network provider',
      };
    }

    const interfaces = net.interfaces || [];
    const defaultInterface = net.defaultInterface;

    const activeInterface =
      defaultInterface ||
      interfaces.find(
        (i) =>
          i.ipv4Addresses?.length > 0 &&
          !i.description?.toLowerCase().includes('virtual')
      );

    const wifiInterface = interfaces.find(
      (i) =>
        i.type === 'wifi' &&
        i.ipv4Addresses?.length > 0 &&
        !i.description?.toLowerCase().includes('virtual')
    );

    const alias = details?.alias?.toLowerCase() || '';

    const isEthernet =
      activeInterface?.type === 'ethernet' ||
      alias.includes('ethernet');

    const isWifi =
      activeInterface?.type === 'wifi' ||
      (!isEthernet &&
        (Boolean(wifiInterface) ||
          alias.includes('wi-fi') ||
          alias.includes('wlan')));

    const ip =
      activeInterface?.ipv4Addresses?.[0]?.split('/')[0] || '';

    const status =
      details?.connectivity === 'Internet'
        ? 'Internet access'
        : details?.connectivity || 'Connected';

    const speed = details?.speed || '';

    const meta = [status, ip, speed]
      .filter(Boolean)
      .join(' · ');

    if (isWifi) {
      const name =
        details?.name ||
        net.defaultGateway?.ssid ||
        'Wi-Fi Connected';

      return {
        type: 'wifi' as NetworkType,
        tooltip: `${name}\n${meta}`,
      };
    }

    if (isEthernet) {
      const name =
        details?.name ||
        activeInterface?.friendlyName ||
        activeInterface?.name ||
        'Ethernet';

      return {
        type: 'ethernet' as NetworkType,
        tooltip: `${name}\n${meta}`,
      };
    }

    if (activeInterface || details) {
      const name =
        details?.name ||
        activeInterface?.friendlyName ||
        activeInterface?.name ||
        'Connected';

      return {
        type: 'ethernet' as NetworkType,
        tooltip: `${name}\n${meta}`,
      };
    }

    return {
      type: 'disconnected' as NetworkType,
      tooltip: 'Disconnected\nNo internet access',
    };
  };

  const info = () => getNetworkInfo();

  // --------------------------------------------------
  // Fetch network details using PowerShell.
  // --------------------------------------------------

  const fetchNetworkDetails = async () => {
    if (fetching) return;

    fetching = true;

    try {
      const cmd = `
        $profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue;

        $p = $profiles |
          Where-Object {
            $_.IPv4Connectivity -ne 'Disconnected' -or
            $_.IPv6Connectivity -ne 'Disconnected'
          } |
          Select-Object -First 1;

        if ($p) {
          $a = Get-NetAdapter -InterfaceIndex $p.InterfaceIndex -ErrorAction SilentlyContinue;

          $name = $p.Name;
          $alias = $p.InterfaceAlias;
          $connectivity = $p.IPv4Connectivity;

          if ($connectivity -eq 'Disconnected') {
            $connectivity = $p.IPv6Connectivity;
          }

          $speed = '';

          if ($a) {
            $speed = $a.LinkSpeed;
          }

          ($name, $alias, $connectivity, $speed) -join '|'
        }
      `;

      const res = await zebar.shellExec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        cmd,
      ]);

      if (!mounted) return;

      const output = res.stdout?.trim();

      if (output && output.includes('|')) {
        const [name, alias, connectivity, speed] =
          output.split('|');

        setNetDetails({
          name: name?.trim() || '',
          alias: alias?.trim() || '',
          connectivity: connectivity?.trim() || 'Connected',
          speed: speed?.trim() || '',
        });
      } else {
        setNetDetails(null);
      }
    } catch (err) {
      console.error('Network detection failed:', err);

      if (mounted) {
        setNetDetails(null);
      }
    } finally {
      fetching = false;
    }
  };

  // --------------------------------------------------
  // Initial detection and provider updates.
  // --------------------------------------------------

  createEffect(() => {
    providers.network?.defaultInterface?.name;
    void fetchNetworkDetails();
  });

  const interval = setInterval(fetchNetworkDetails, 10000);

  // --------------------------------------------------
  // Tooltip lifecycle.
  // --------------------------------------------------

  const scheduleTooltipHide = () => {
    clearTooltipHideTimer();

    tooltipHideTimer = setTimeout(() => {
      if (!pointerOnIcon && !pointerOnPopup) {
        tooltipChannel.postMessage({
          type: 'hide',
        });
      }
    }, 500);
  };

  const showNetworkTooltip = async () => {
    pointerOnIcon = true;
    clearTooltipHideTimer();

    latestTooltipText = info().tooltip;

    if (!tooltipOpened) {
      tooltipOpened = true;

      try {
        await zebar.startWidgetPreset(
          'network-tooltip',
          'default'
        );
      } catch (err) {
        tooltipOpened = false;

        console.error(
          'Failed to open network tooltip:',
          err
        );
      }
    } else {
      tooltipChannel.postMessage({
        type: 'show',
        text: latestTooltipText,
      });
    }
  };

  const hideNetworkTooltip = () => {
    pointerOnIcon = false;
    scheduleTooltipHide();
  };

  tooltipChannel.onmessage = (event: MessageEvent) => {
    const message = event.data;

    if (message.type === 'ready') {
      if (pointerOnIcon || pointerOnPopup) {
        tooltipChannel.postMessage({
          type: 'show',
          text: latestTooltipText,
        });
      } else {
        tooltipChannel.postMessage({
          type: 'hide',
        });
      }
    }

    if (message.type === 'popup-hover') {
      pointerOnPopup = message.hovering;

      if (pointerOnPopup) {
        clearTooltipHideTimer();
      } else {
        scheduleTooltipHide();
      }
    }

    if (message.type === 'closed') {
      tooltipOpened = false;
    }
  };

  // --------------------------------------------------
  // Launch Windows URI.
  // --------------------------------------------------

  const launchWindowsUri = async (uri: string) => {
    try {
      await zebar.shellExec('explorer.exe', [uri]);
    } catch (err) {
      console.error('Failed to launch Windows URI:', err);
    }
  };

  // Left-click: Open available networks.
  const openNetworkFlyout = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    void launchWindowsUri('ms-availablenetworks:');
  };

  // Right-click: Open network settings.
  const openNetworkSettings = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const uri =
      info().type === 'ethernet'
        ? 'ms-settings:network-ethernet'
        : 'ms-settings:network-wifi';

    void launchWindowsUri(uri);
  };

  // --------------------------------------------------
  // Cleanup.
  // --------------------------------------------------

  onCleanup(() => {
    mounted = false;

    clearInterval(interval);
    clearTooltipHideTimer();

    tooltipChannel.close();
  });

  // --------------------------------------------------
  // Component UI.
  // --------------------------------------------------

  return (
    <Show when={providers.network}>
      <div
        class="flex items-center"
        onMouseEnter={showNetworkTooltip}
        onMouseLeave={hideNetworkTooltip}
      >
        <button
          type="button"
          onClick={openNetworkFlyout}
          onContextMenu={openNetworkSettings}
          aria-label={`${info().tooltip}. Left-click to change network. Right-click for network settings.`}
          class="flex items-center justify-center hover:bg-overlay px-1.5 py-0.5 rounded transition-colors cursor-pointer bg-transparent border-none text-foam pointer-events-auto select-none"
          style={{
            'pointer-events': 'auto',
            'user-select': 'none',
          }}
        >
          <Switch>
            <Match when={info().type === 'wifi'}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 20h.01" />
                <path d="M2 8.82a15 15 0 0 1 20 0" />
                <path d="M5 12.859a10 10 0 0 1 14 0" />
                <path d="M8.5 16.429a5 5 0 0 1 7 0" />
              </svg>
            </Match>

            <Match when={info().type === 'ethernet'}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="16" y="16" width="6" height="6" rx="1" />
                <rect x="2" y="16" width="6" height="6" rx="1" />
                <rect x="9" y="2" width="6" height="6" rx="1" />
                <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
                <path d="M12 12V8" />
              </svg>
            </Match>

            <Match when={info().type === 'disconnected'}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-love"
              >
                <line x1="2" x2="22" y1="2" y2="22" />
                <path d="M8.5 16.429a5 5 0 0 1 7 0" />
                <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
                <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
                <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
                <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
                <line x1="12" x2="12.01" y1="20" y2="20" />
              </svg>
            </Match>
          </Switch>
        </button>
      </div>
    </Show>
  );
};

