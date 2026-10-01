import "../style.css";
import { initPage } from "../page.js";
import { createPlayerNotesView } from "../playerNotesView.js";

initPage("statistics", "notes");
createPlayerNotesView().refresh();
