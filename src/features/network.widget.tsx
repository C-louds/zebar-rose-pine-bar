import { Show, Switch, Match, createSignal, createEffect, onCleanup } from 'solid-js';
import * as zebar from 'zebar';
import { useProviders } from '../providers';

interface NetDetails {
  name: string;
  alias: string;
  connectivity: string;
  speed: string;
  mac: string;
  gateway: string;
  dns: string;
}

export const Network = () => {
  const providers = useProviders();
  const [netDetails, setNetDetails] = createSignal<NetDetails | null>(null);

  let fetching = false;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const formatRate = (bytesPerSec?: number) => {
    if (!bytesPerSec || bytesPerSec < 1024) return `${Math.round(bytesPerSec || 0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  // Query Windows Network Profile, Adapter & IP Configuration (works with Location OFF).
  const fetchNetworkDetails = async () => {
    if (fetching) return;
    fetching = true;

    try {
      const cmd =
        "$p = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' -or $_.IPv6Connectivity -ne 'Disconnected' } | Select-Object -First 1; if ($p) { $a = Get-NetAdapter -InterfaceIndex $p.InterfaceIndex -ErrorAction SilentlyContinue; $ip = Get-NetIPConfiguration -InterfaceIndex $p.InterfaceIndex -ErrorAction SilentlyContinue; $gw = $ip.IPv4DefaultGateway.NextHop; $dns = ($ip.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | Select-Object -First 1).ServerAddresses[0]; ($p.Name, $p.InterfaceAlias, $p.IPv4Connectivity, $a.LinkSpeed, $a.MacAddress, $gw, $dns) -join '|' }";

      const res = await zebar.shellExec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        cmd,
      ]);

      const out = res.stdout?.trim();
      if (out && out.includes('|')) {
        const [name, alias, connectivity, speed, mac, gateway, dns] = out.split('|');
        setNetDetails({
          name: name?.trim() || '',
          alias: alias?.trim() || '',
          connectivity: connectivity?.trim() || 'Connected',
          speed: speed?.trim() || '',
          mac: mac?.trim() || '',
          gateway: gateway?.trim() || '',
          dns: dns?.trim() || '',
        });
      } else {
        setNetDetails(null);
      }
    } catch (err) {
      console.error('Network profile detection failed:', err);
      setNetDetails(null);
    } finally {
      fetching = false;
    }
  };

  createEffect(() => {
    providers.network?.defaultInterface?.name;
    fetchNetworkDetails();
  });

  const interval = setInterval(fetchNetworkDetails, 10000);
  onCleanup(() => clearInterval(interval));

  const getNetworkInfo = () => {
    const net = providers.network;
    const details = netDetails();

    if (!net) {
      return {
        type: 'disconnected' as const,
        name: 'Disconnected',
        status: 'No network provider',
        ip: '',
        gateway: '',
        dns: '',
        speed: '',
        mac: '',
        alias: '',
        down: '0 B/s',
        up: '0 B/s',
      };
    }

    const defaultInterface = net.defaultInterface;
    const wifiInterface = net.interfaces?.find(
      (i) =>
        i.type === 'wifi' &&
        i.ipv4Addresses.length > 0 &&
        !i.description?.includes('Virtual')
    );

    const activeInterface = defaultInterface || wifiInterface;
    const ip = activeInterface?.ipv4Addresses?.[0]?.split('/')[0] || '';
    const gatewayIp =
      details?.gateway ||
      net.defaultGateway?.ipv4Addresses?.[0]?.split('/')[0] ||
      '';
    const down = formatRate(net.traffic?.received?.bytes);
    const up = formatRate(net.traffic?.transmitted?.bytes);

    const isEthernet =
      activeInterface?.type === 'ethernet' ||
      details?.alias.toLowerCase().includes('ethernet');

    const isWifi =
      activeInterface?.type === 'wifi' ||
      Boolean(wifiInterface) ||
      details?.alias.toLowerCase().includes('wi-fi') ||
      details?.alias.toLowerCase().includes('wlan');

    const statusText =
      details?.connectivity === 'Internet'
        ? 'Internet access'
        : details?.connectivity || 'Connected';

    if (isEthernet) {
      return {
        type: 'ethernet' as const,
        name:
          details?.name ||
          activeInterface?.friendlyName ||
          activeInterface?.name ||
          'Ethernet',
        status: statusText,
        ip,
        gateway: gatewayIp,
        dns: details?.dns || '',
        speed: details?.speed || '',
        mac: details?.mac || activeInterface?.macAddress || '',
        alias: details?.alias || activeInterface?.name || 'Ethernet',
        down,
        up,
      };
    }

    if (isWifi) {
      return {
        type: 'wifi' as const,
        name: details?.name || net.defaultGateway?.ssid || 'Wi-Fi Connected',
        status: statusText,
        ip,
        gateway: gatewayIp,
        dns: details?.dns || '',
        speed: details?.speed || '',
        mac: details?.mac || activeInterface?.macAddress || '',
        alias: details?.alias || activeInterface?.name || 'Wi-Fi',
        down,
        up,
      };
    }

    if (activeInterface || details?.name) {
      return {
        type: 'ethernet' as const,
        name:
          details?.name ||
          activeInterface?.friendlyName ||
          activeInterface?.name ||
          'Connected',
        status: statusText,
        ip,
        gateway: gatewayIp,
        dns: details?.dns || '',
        speed: details?.speed || '',
        mac: details?.mac || activeInterface?.macAddress || '',
        alias: details?.alias || activeInterface?.name || 'Network',
        down,
        up,
      };
    }

    return {
      type: 'disconnected' as const,
      name: 'Disconnected',
      status: 'No internet access',
      ip: '',
      gateway: '',
      dns: '',
      speed: '',
      mac: '',
      alias: '',
      down: '0 B/s',
      up: '0 B/s',
    };
  };

  // Sync live network data to localStorage so the tooltip window updates in real time.
  createEffect(() => {
    localStorage.setItem('zebar-net-info', JSON.stringify(getNetworkInfo()));
  });

  const showTooltip = (e: MouseEvent) => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    localStorage.setItem('zebar-net-info', JSON.stringify(getNetworkInfo()));

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(10, Math.round(window.screenX + rect.left - 120));
    const y = Math.round(window.screenY + rect.bottom + 8);

    zebar.startWidget('network-tooltip', {
      anchor: 'top_left',
      offsetX: `${x}px`,
      offsetY: `${y}px`,
      width: '260px',
      height: '210px',
      monitorSelection: { type: 'all' },
      dockToEdge: { enabled: false, edge: null, windowMargin: '0px' },
    });
  };

  const hideTooltip = () => {
    hideTimeout = setTimeout(async () => {
      try {
        await zebar.shellExec('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-WindowStyle',
          'Hidden',
          '-Command',
          "Get-Process zebar -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*network-tooltip*' } | ForEach-Object { $_.CloseMainWindow() | Out-Null }",
        ]);
      } catch (err) {
        console.error('Failed to close tooltip:', err);
      }
    }, 150);
  };

  const launchWindowsUri = async (uri: string) => {
    try {
      await zebar.shellExec('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        `Start-Process '${uri}'`,
      ]);
    } catch (err) {
      console.error('Failed to launch Windows URI:', err);
    }
  };

  const openNetworkFlyout = (e: MouseEvent) => {
    e.preventDefault();
    launchWindowsUri('ms-availablenetworks:');
  };

  const openNetworkSettings = (e: MouseEvent) => {
    e.preventDefault();
    const isEth = getNetworkInfo().type === 'ethernet';
    launchWindowsUri(
      isEth ? 'ms-settings:network-ethernet' : 'ms-settings:network-wifi'
    );
  };

  const info = () => getNetworkInfo();

  return (
    <Show when={providers.network}>
      <button
        type="button"
        onClick={openNetworkFlyout}
        onContextMenu={openNetworkSettings}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        class="flex items-center justify-center hover:bg-rp-overlay px-1.5 py-0.5 rounded transition-colors cursor-pointer bg-transparent border-none text-rp-foam pointer-events-auto"
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
              class="text-rp-love"
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
    </Show>
  );
};
