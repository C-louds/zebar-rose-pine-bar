import { For, Show } from 'solid-js';
import { useProviders } from '../providers';
import { Group } from '../components/group.component';

export const Systray = () => {
  const providers = useProviders();

  return (
    <Show when={providers.tray}>
      <Group>
        <div class="flex items-center gap-1">
          <For each={providers.tray?.icons}>
            {(item) => (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  providers.tray?.onLeftClick(item.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  providers.tray?.onRightClick(item.id);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    providers.tray?.onMiddleClick?.(item.id);
                  }
                }}
                class="hover:bg-overlay p-1 rounded transition-colors"
                title={item.tooltip ?? item.id}
              >
                <img
                  src={item.iconUrl}
                  alt={item.tooltip ?? item.id}
                  class="w-4 h-4 object-contain"
                />
              </button>
            )}
          </For>
        </div>
      </Group>
    </Show>
  );
};
