import "../style.css";
import { initPage } from "../page.js";
import { createSeasonReportView } from "../seasonReportView.js";

initPage("statistics");
createSeasonReportView().refresh();
