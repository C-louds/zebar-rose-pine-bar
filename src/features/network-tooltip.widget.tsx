import { createSignal, onMount, onCleanup, Show } from 'solid-js';

export const NetworkTooltip = () => {
  const [info, setInfo] = createSignal<any>(null);

  const loadInfo = () => {
    const raw = localStorage.getItem('zebar-net-info');
    if (raw) {
      try {
        setInfo(JSON.parse(raw));
      } catch (e) {
        console.error(e);
      }
    }
  };

  onMount(() => {
    loadInfo();
    const timer = setInterval(loadInfo, 500);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <Show when={info()}>
      <div
        style={{
          "background-color": "var(--color-rose-pine-base)",
          color: "var(--color-rose-pine-text)",
        }}
        class="w-full h-full p-3 bg-[var(--color-rose-pine-base)] text-[var(--color-rose-pine-text)] border-2 border-rp-muted rounded-2xl flex flex-col justify-between select-none box-border shadow-lg"
      >
        {/* Header: SSID / Profile Name + Interface Badge */}
        <div class="flex items-center justify-between gap-2 border-b border-rp-highlightMed pb-1.5">
          <div class="flex items-center gap-1.5 truncate">
            <span
              class={`w-2 h-2 rounded-full shrink-0 ${
                info().type === 'disconnected' ? 'bg-rp-love' : 'bg-rp-foam'
              }`}
            />
            <span class="font-bold text-xs truncate">
              {info().name}
            </span>
          </div>
          <Show when={info().alias}>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-rp-surface border border-rp-highlightMed shrink-0 opacity-90">
              {info().alias}
            </span>
          </Show>
        </div>

        {/* Network Details Grid */}
        <div class="grid grid-cols-[68px_1fr] gap-y-1 text-[11px] my-1">
          <span class="opacity-60">Status</span>
          <span class="truncate text-right">{info().status}</span>

          <Show when={info().ip}>
            <span class="opacity-60">IPv4</span>
            <span class="truncate text-right">{info().ip}</span>
          </Show>

          <Show when={info().gateway}>
            <span class="opacity-60">Gateway</span>
            <span class="truncate text-right">{info().gateway}</span>
          </Show>

          <Show when={info().dns}>
            <span class="opacity-60">DNS</span>
            <span class="truncate text-right">{info().dns}</span>
          </Show>

          <Show when={info().speed}>
            <span class="opacity-60">Speed</span>
            <span class="truncate text-right">{info().speed}</span>
          </Show>

          <Show when={info().mac}>
            <span class="opacity-60">MAC</span>
            <span class="truncate text-right text-[10px]">
              {info().mac}
            </span>
          </Show>
        </div>

        {/* Live Traffic Footer */}
        <div class="flex items-center justify-between pt-1.5 border-t border-rp-highlightMed text-[11px]">
          <span class="flex items-center gap-1">
            <span class="text-rp-foam">↓</span> {info().down}
          </span>
          <span class="flex items-center gap-1">
            <span class="text-rp-rose">↑</span> {info().up}
          </span>
        </div>
      </div>
    </Show>
  );
};
