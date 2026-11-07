import { For, Show } from 'solid-js';
import { useProviders } from '../providers';

export const Systray = () => {
  const providers = useProviders();

  return (
    <Show when={providers.tray}>
      <div class="flex items-center gap-1.5 pointer-events-auto">
        <For each={providers.tray?.icons}>
          {(icon) => (
            <img
              src={icon.iconUrl}
              title={icon.tooltip}
              class="w-4 h-4 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                providers.tray?.onLeftClick(icon.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                providers.tray?.onRightClick(icon.id);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  providers.tray?.onMiddleClick(icon.id);
                }
              }}
            />
          )}
        </For>
      </div>
    </Show>
  );
};
