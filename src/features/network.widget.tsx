
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

interface NetworkInfo {
  type: NetworkType;
  name: string;
  status: string;
  ip: string;
  speed: string;
}

export const Network = () => {
  const providers = useProviders();

  const [netDetails, setNetDetails] =
    createSignal<NetDetails | null>(null);

  const [tooltipVisible, setTooltipVisible] =
    createSignal(false);

  let fetching = false;
  let mounted = true;

  // --------------------------------------------------
  // Fetch network details using Windows PowerShell.
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

  onCleanup(() => {
    mounted = false;
    clearInterval(interval);
  });

  // --------------------------------------------------
  // Determine active network.
  // --------------------------------------------------

  const getNetworkInfo = (): NetworkInfo => {
    const net = providers.network;
    const details = netDetails();

    if (!net) {
      return {
        type: 'disconnected',
        name: 'Disconnected',
        status: 'No network provider',
        ip: '',
        speed: '',
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

    if (isWifi) {
      return {
        type: 'wifi',
        name:
          details?.name ||
          net.defaultGateway?.ssid ||
          'Wi-Fi Connected',
        status,
        ip,
        speed,
      };
    }

    if (isEthernet) {
      return {
        type: 'ethernet',
        name:
          details?.name ||
          activeInterface?.friendlyName ||
          activeInterface?.name ||
          'Ethernet',
        status,
        ip,
        speed,
      };
    }

    if (activeInterface || details) {
      return {
        type: 'ethernet',
        name:
          details?.name ||
          activeInterface?.friendlyName ||
          activeInterface?.name ||
          'Connected',
        status,
        ip,
        speed,
      };
    }

    return {
      type: 'disconnected',
      name: 'Disconnected',
      status: 'No internet access',
      ip: '',
      speed: '',
    };
  };

  const info = () => getNetworkInfo();

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

  // --------------------------------------------------
  // Left-click: Open available networks.
  // --------------------------------------------------

  const openNetworkFlyout = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    void launchWindowsUri('ms-availablenetworks:');
  };

  // --------------------------------------------------
  // Right-click: Open network settings.
  // --------------------------------------------------

  const openNetworkSettings = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const type = info().type;

    const uri =
      type === 'ethernet'
        ? 'ms-settings:network-ethernet'
        : 'ms-settings:network-wifi';

    void launchWindowsUri(uri);
  };

  // --------------------------------------------------
  // Component UI.
  // --------------------------------------------------

  return (
    <Show when={providers.network}>
      <div
        class="relative"
        onMouseEnter={() => {console.log('[Network] Mouse entered'); setTooltipVisible(true)}}
        onMouseLeave={() => {console.log('[Network] Mouse left'); setTooltipVisible(false)}}
      >
        {/* Network icon */}

        <button
          type="button"
          onClick={openNetworkFlyout}
          onContextMenu={openNetworkSettings}
          aria-label={`${info().name}: ${info().status}`}
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

        {/* Rose Pine tooltip */}
<div
  style={{
    position: 'fixed',
    top: '0px',
    left: '0px',
    'z-index': '999999',
    background: '#26233a',
    color: '#e0def4',
    padding: '8px',
    border: '2px solid #9ccfd8',
    display: tooltipVisible() ? 'block' : 'none',
  }}
>
  NETWORK TOOLTIP TEST
</div>
	<div
          role="tooltip"
          class={`absolute top-full right-0 mt-2 z-50
            w-64 rounded-lg
            bg-rose-pine-surface
            border border-rose-pine-highlight-med
            shadow-xl
            p-3
            transition-all duration-200
            ${
              tooltipVisible()
                ? 'opacity-100 visible'
                : 'opacity-0 invisible'
            }`}
        >
          {/* Network name and status */}

          <div class="flex items-center justify-between gap-2">
            <div class="text-rose-pine-text font-semibold text-sm truncate">
              {info().name}
            </div>

            <span
              class={`text-xs shrink-0 ${
                info().type === 'disconnected'
                  ? 'text-rose-pine-love'
                  : 'text-rose-pine-foam'
              }`}
            >
              {info().type === 'disconnected'
                ? 'Offline'
                : 'Connected'}
            </span>
          </div>

          <div class="text-rose-pine-subtle text-xs mt-1">
            {info().status}
          </div>

          {/* Network details */}

          <div class="border-t border-rose-pine-highlight-med mt-3 pt-2 space-y-2">
            <Show when={info().ip}>
              <div class="flex justify-between items-center gap-3">
                <span class="text-rose-pine-muted text-xs">
                  IP Address
                </span>

                <span class="text-rose-pine-text text-xs font-mono">
                  {info().ip}
                </span>
              </div>
            </Show>

            <Show when={info().speed}>
              <div class="flex justify-between items-center gap-3">
                <span class="text-rose-pine-muted text-xs">
                  Link Speed
                </span>

                <span class="text-rose-pine-text text-xs">
                  {info().speed}
                </span>
              </div>
            </Show>
          </div>

          {/* Click instructions */}

          <div class="border-t border-rose-pine-highlight-med mt-3 pt-2 space-y-1">
            <div class="text-rose-pine-muted text-xs">
              Left-click · Change network
            </div>

            <div class="text-rose-pine-muted text-xs">
              Right-click · Network settings
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};

