/* @refresh reload */
import "@/index.css";
import { render } from "solid-js/web";
import { NetworkTooltip } from "../../features/network-tooltip.widget";

render(() => <NetworkTooltip />, document.getElementById("root")!);
