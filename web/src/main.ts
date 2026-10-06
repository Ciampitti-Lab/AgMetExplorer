import "@fontsource-variable/inter";
import "@fontsource-variable/outfit";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { App } from "./app";
import { loadData } from "./data";

loadData()
  .then((data) => new App(data))
  .catch((err: unknown) => {
    console.error(err);
    const detail = document.querySelector("#detail");
    if (detail) {
      detail.innerHTML = `<div class="empty"><h2>Data could not be loaded</h2><p>Please try again later.</p></div>`;
    }
  });
