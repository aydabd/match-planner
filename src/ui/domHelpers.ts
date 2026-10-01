/** Generic DOM builders the statistics-family screens share. No state, no app logic. */

export function byId(id: string): HTMLElement {
	const node = document.getElementById(id);
	if (!node) throw new Error(`Missing element #${id}`);
	return node;
}

export function card(title: string): HTMLElement {
	const section = document.createElement("section");
	section.className = "card";
	const heading = document.createElement("h2");
	heading.textContent = title;
	section.append(heading);
	return section;
}

export function table(
	headers: readonly string[],
	rows: readonly (readonly string[])[],
): HTMLTableElement {
	const el = document.createElement("table");
	el.className = "report-table";
	const head = el.appendChild(document.createElement("thead"));
	const headRow = head.appendChild(document.createElement("tr"));
	for (const header of headers) {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = header;
		headRow.append(th);
	}
	const body = el.appendChild(document.createElement("tbody"));
	for (const values of rows) {
		const row = body.appendChild(document.createElement("tr"));
		values.forEach((text, i) => {
			const cell = document.createElement(i === 0 ? "th" : "td");
			if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = "row";
			cell.textContent = text;
			row.append(cell);
		});
	}
	return el;
}

/** A labelled field, the same field/field-label wrapper the setup screen uses. */
export function field(
	labelText: string,
	control: HTMLElement,
	id: string,
): HTMLElement {
	control.id = id;
	const wrap = document.createElement("div");
	wrap.className = "field";
	const label = document.createElement("label");
	label.className = "field-label";
	label.textContent = labelText;
	label.htmlFor = id;
	wrap.append(label, control);
	return wrap;
}

/** A labelled <select> field; returns both the wrapper and the select to wire up. */
export function selectField(
	labelText: string,
	id: string,
	options: readonly (readonly [string, string])[],
): { wrap: HTMLElement; select: HTMLSelectElement } {
	const select = document.createElement("select");
	for (const [value, text] of options) {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = text;
		select.append(opt);
	}
	return { wrap: field(labelText, select, id), select };
}

/** Offers `json` to the browser as a file download. */
export function downloadJson(fileName: string, json: string): void {
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	URL.revokeObjectURL(url);
}
