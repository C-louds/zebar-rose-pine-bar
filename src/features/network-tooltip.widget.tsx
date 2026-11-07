
import { Show, createSignal, onCleanup } from 'solid-js';
import * as zebar from 'zebar';

export const NetworkTooltip = () => {
  const [visible, setVisible] = createSignal(false);
  const [networkInfo, setNetworkInfo] = createSignal(
    'Waiting for network information...'
  );

  const channel = new BroadcastChannel('rose-pine-network-tooltip');

  const widget = zebar.currentWidget();

  let hovering = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let closing = false;

  const clearCloseTimer = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };

  const closePopup = () => {
    if (closing) return;

    closing = true;
    channel.postMessage({ type: 'closed' });
    void widget.close();
  };

  const scheduleClose = () => {
    clearCloseTimer();

    closeTimer = setTimeout(() => {
      if (!hovering) {
        closePopup();
      }
    }, 500);
  };

  channel.onmessage = (event: MessageEvent) => {
    const message = event.data;

    if (message.type === 'show') {
      clearCloseTimer();
      setNetworkInfo(message.text || 'Network information unavailable');
      setVisible(true);
    }

    if (message.type === 'hide' && !hovering) {
      scheduleClose();
    }
  };

  const handleMouseEnter = () => {
    hovering = true;
    clearCloseTimer();

    channel.postMessage({
      type: 'popup-hover',
      hovering: true,
    });
  };

  const handleMouseLeave = () => {
    hovering = false;

    channel.postMessage({
      type: 'popup-hover',
      hovering: false,
    });

    scheduleClose();
  };

  // Tell the network widget that this popup is ready.
  channel.postMessage({ type: 'ready' });

  onCleanup(() => {
    clearCloseTimer();
    channel.close();
  });

  return (
    <Show when={visible()}>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          height: '100%',
          'box-sizing': 'border-box',
          padding: '12px',
          background: '#191724',
          color: '#e0def4',
          'font-family': 'inherit',
        }}
      >
        <div
          style={{
            background: '#26233a',
            border: '1px solid #524f67',
            'border-radius': '12px',
            padding: '16px',
            'box-shadow': '0 8px 28px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              'margin-bottom': '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '9px',
              }}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9ccfd8"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <path d="M12 20h.01" />
              </svg>

              <span
                style={{
                  'font-size': '14px',
                  'font-weight': '600',
                  color: '#e0def4',
                }}
              >
                Network
              </span>
            </div>

            <span
              style={{
                'font-size': '10px',
                color: '#9ccfd8',
                background: '#1f303b',
                padding: '4px 8px',
                'border-radius': '20px',
              }}
            >
              CONNECTION INFO
            </span>
          </div>

          <div
            style={{
              height: '1px',
              background: '#403d52',
              'margin-bottom': '12px',
            }}
          />

          <div
            style={{
              color: '#e0def4',
              'font-size': '13px',
              'font-weight': '500',
              'line-height': '1.7',
              'white-space': 'pre-wrap',
              'overflow-wrap': 'anywhere',
            }}
          >
            {networkInfo()}
          </div>

          <div
            style={{
              height: '1px',
              background: '#403d52',
              'margin-top': '12px',
              'margin-bottom': '10px',
            }}
          />

          <div
            style={{
              color: '#908caa',
              'font-size': '10px',
              display: 'flex',
              'justify-content': 'space-between',
            }}
          >
            <span>Left-click: Change network</span>
            <span>Right-click: Settings</span>
          </div>
        </div>
      </div>
    </Show>
  );
};

