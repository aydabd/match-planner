import "../style.css";
import { initPage } from "../page.js";
import { createStatisticsView } from "../statisticsView.js";

initPage("statistics", "overview");
createStatisticsView().refresh();
