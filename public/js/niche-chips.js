/* Shared niche picker: searchable checkbox chips + "Other" free text.
 * Usage:
 *   const picker = await initNichePicker(document.getElementById('x'), { selected: ['Food'] });
 *   const { niches } = picker.getSelection(); // array of chosen niche names
 *
 * New names typed into the "Other" box are returned as-is; the server adds
 * them to the canonical catalog (deduped, case-insensitive).
 */
async function initNichePicker(container, opts) {
  opts = opts || {};
  const selected = new Set(opts.selected || []);
  const customAdded = new Set();

  container.innerHTML =
    '<input class="input niche-search" type="search" placeholder="Search niches…" autocomplete="off">' +
    '<div class="niche-chips" role="group" aria-label="Niches"></div>' +
    '<div class="niche-other">' +
    '  <label>Can\'t find yours? Add it:</label>' +
    '  <div class="niche-other-row">' +
    '    <input class="input" type="text" maxlength="40" placeholder="e.g. Gardening">' +
    '    <button type="button" class="btn ghost small niche-add">Add</button>' +
    '  </div>' +
    '</div>';

  const search = container.querySelector(".niche-search");
  const chipsBox = container.querySelector(".niche-chips");
  const otherInput = container.querySelector(".niche-other input");
  const addBtn = container.querySelector(".niche-add");

  let catalog = [];
  try {
    const r = await fetch("/api/niches");
    const d = await r.json();
    catalog = (d.niches || []).map((n) => n.name);
  } catch (e) { /* offline: chips from selection only */ }

  function renderChips() {
    const q = search.value.trim().toLowerCase();
    const names = [];
    for (const n of catalog) if (!names.includes(n)) names.push(n);
    for (const n of selected) if (!names.includes(n)) names.push(n);
    chipsBox.innerHTML = "";
    names
      .filter((n) => !q || n.toLowerCase().includes(q))
      .forEach((n) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + (selected.has(n) ? " active" : "");
        b.setAttribute("aria-pressed", selected.has(n) ? "true" : "false");
        b.textContent = n;
        b.onclick = () => {
          if (selected.has(n)) { selected.delete(n); customAdded.delete(n); }
          else selected.add(n);
          renderChips();
        };
        chipsBox.appendChild(b);
      });
    if (!chipsBox.children.length) {
      chipsBox.innerHTML = '<span class="sub">No matches — add it below.</span>';
    }
  }

  function addOther() {
    const v = otherInput.value.trim().replace(/\s+/g, " ");
    if (!v) return;
    const match = [...selected, ...catalog].find((n) => n.toLowerCase() === v.toLowerCase());
    if (match) { selected.add(match); }
    else { selected.add(v); customAdded.add(v); }
    otherInput.value = "";
    search.value = "";
    renderChips();
  }

  search.addEventListener("input", renderChips);
  addBtn.addEventListener("click", addOther);
  otherInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } });

  renderChips();

  return {
    getSelection() {
      const other = otherInput.value.trim().replace(/\s+/g, " ");
      const niches = [...selected];
      if (other && ![...selected].some((n) => n.toLowerCase() === other.toLowerCase())) niches.push(other);
      return { niches };
    },
    setSelected(list) {
      selected.clear(); customAdded.clear();
      (list || []).forEach((n) => { if (n) selected.add(n); });
      renderChips();
    },
  };
}
