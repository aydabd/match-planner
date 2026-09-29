import "../style.css";
import { createHistoryView } from "../history.js";
import { initPage } from "../page.js";

initPage("statistics");
createHistoryView().refresh();
