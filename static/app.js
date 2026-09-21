const stateInput = document.querySelector("#state-input");
const stateCount = document.querySelector("#state-count");
const questionsList = document.querySelector("#questions-list");
const form = document.querySelector("#predict-form");
const predictButton = document.querySelector("#predict-button");
const formError = document.querySelector("#form-error");
const results = document.querySelector("#results");
const latency = document.querySelector("#latency");
let questionNumber = 0;

const initialQuestions = [
  {
    type: "choice",
    instructions: "Which team should handle this request?",
    criteria: [["billing", "Invoices, payments, refunds"], ["technical", "Bugs, outages, errors"], ["sales", "Pricing or new contracts"], ["other", "Everything else"]],
  },
  {
    type: "score",
    instructions: "How urgent is this request?",
    criteria: ["Not urgent", "Soon", "Critical or blocking"],
  },
  {
    type: "noul",
    instructions: "Does the customer explicitly request a refund?",
    criteria: [],
  },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function questionMarkup(question, number) {
  const id = `question-${number}`;
  return `<article class="question" data-question data-number="${number}">
    <div class="question-topline"><span class="question-index">${String(number).padStart(2, "0")}</span><button type="button" class="remove-question" aria-label="Remove question ${number}">Remove</button></div>
    <div class="question-controls">
      <label class="question-label">Type
        <select data-field="type" aria-label="Question ${number} type">
          <option value="choice" ${question.type === "choice" ? "selected" : ""}>choice / pick one</option>
          <option value="score" ${question.type === "score" ? "selected" : ""}>score / ordinal level</option>
          <option value="noul" ${question.type === "noul" ? "selected" : ""}>noul / yes-no probability</option>
        </select>
      </label>
      <label class="question-label grow">Instructions
        <input data-field="instructions" value="${escapeHtml(question.instructions)}" maxlength="2000" required>
      </label>
    </div>
    <div class="criteria" data-criteria>${criteriaMarkup(question)}</div>
  </article>`;
}

function criteriaMarkup(question) {
  if (question.type === "noul") return `<p class="criteria-hint">The model scores the statement as true or false.</p>`;
  if (question.type === "score") {
    return `<div class="criteria-heading"><span>Levels, from low to high</span><button type="button" class="add-criterion">+ level</button></div><div class="criteria-rows">${question.criteria.map((item) => `<label class="criterion-row"><span class="criterion-marker"></span><input data-criterion value="${escapeHtml(item)}" required><button type="button" class="remove-criterion" aria-label="Remove level">×</button></label>`).join("")}</div>`;
  }
  return `<div class="criteria-heading"><span>Labels and meaning</span><button type="button" class="add-criterion">+ label</button></div><div class="criteria-rows">${question.criteria.map(([label, meaning]) => `<div class="choice-row"><input data-label value="${escapeHtml(label)}" aria-label="Choice label" required><input data-meaning value="${escapeHtml(meaning)}" aria-label="Choice meaning"><button type="button" class="remove-criterion" aria-label="Remove choice">×</button></div>`).join("")}</div>`;
}

function renderQuestion(question) {
  questionNumber += 1;
  questionsList.insertAdjacentHTML("beforeend", questionMarkup(question, questionNumber));
}

function currentQuestions() {
  return [...document.querySelectorAll("[data-question]")].map((element, index) => {
    const type = element.querySelector('[data-field="type"]').value;
    const instructions = element.querySelector('[data-field="instructions"]').value.trim();
    if (type === "noul") return { id: `question_${index + 1}`, type, instructions };
    if (type === "score") return { id: `question_${index + 1}`, type, instructions, criteria: [...element.querySelectorAll("[data-criterion]")].map((input) => input.value.trim()) };
    return { id: `question_${index + 1}`, type, instructions, criteria: Object.fromEntries([...element.querySelectorAll(".choice-row")].map((row) => [row.querySelector("[data-label]").value.trim(), row.querySelector("[data-meaning]").value.trim()])) };
  });
}

function updateCount() { stateCount.textContent = `${stateInput.value.length.toLocaleString()} chars`; }
function showError(message) { formError.textContent = message; formError.hidden = false; }
function clearError() { formError.hidden = true; formError.textContent = ""; }
function setButtonLoading(loading) { predictButton.disabled = loading; predictButton.querySelector("span").textContent = loading ? "Reading…" : "Run decisions"; }

function renderChoice(answer) {
  const rows = Object.entries(answer.probabilities).sort(([, a], [, b]) => b - a);
  return `<div class="answer-main"><span class="answer-value">${escapeHtml(answer.choice)}</span><span class="answer-confidence">${Math.round(answer.confidence * 100)}% confidence</span></div><div class="probability-list">${rows.map(([label, value]) => `<div class="probability-row"><div class="probability-meta"><span>${escapeHtml(label)}</span><strong>${Math.round(value * 100)}%</strong></div><div class="bar"><span style="width:${Math.max(2, value * 100)}%"></span></div></div>`).join("")}</div>`;
}

function renderScore(answer) {
  const rows = Object.entries(answer.probabilities);
  return `<div class="answer-main"><span class="answer-value">${answer.score.toFixed(2)}</span><span class="answer-confidence">expected level · ${Math.round(answer.confidence * 100)}% confidence</span></div><div class="score-scale">${rows.map(([level, value]) => `<div class="score-level"><span class="score-dot" style="opacity:${Math.max(.2, value * 2)}"></span><span class="score-label">${escapeHtml(answer.legend[level])}</span><strong>${Math.round(value * 100)}%</strong></div>`).join("")}</div>`;
}

function renderNoul(answer) {
  const probability = answer.noul;
  return `<div class="answer-main"><span class="answer-value">${Math.round(probability * 100)}%</span><span class="answer-confidence">probability the statement is true</span></div><div class="noul-meter"><span style="width:${Math.max(2, probability * 100)}%"></span></div><div class="noul-ends"><span>false</span><span>true</span></div>`;
}

function renderResults(payload) {
  const cards = Object.entries(payload.answers).map(([id, answer], index) => `<article class="result-row"><div class="result-label"><span class="question-index">${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(id.replaceAll("_", " "))}</h3><span class="type-chip">${answer.type}</span></div><div class="answer-content">${answer.type === "choice" ? renderChoice(answer) : answer.type === "score" ? renderScore(answer) : renderNoul(answer)}</div></article>`).join("");
  results.className = "results-list";
  results.innerHTML = cards;
}

async function checkService(path, dotId, labelId) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    const data = await response.json();
    const ok = response.ok;
    document.querySelector(`#${dotId}`).className = `status-dot ${ok ? "is-ok" : "is-waiting"}`;
    document.querySelector(`#${labelId}`).textContent = data.status;
  } catch {
    document.querySelector(`#${dotId}`).className = "status-dot is-error";
    document.querySelector(`#${labelId}`).textContent = "offline";
  }
}

stateInput.addEventListener("input", updateCount);
document.querySelector("#add-question").addEventListener("click", () => renderQuestion({ type: "noul", instructions: "Is this statement true?", criteria: [] }));
questionsList.addEventListener("click", (event) => {
  const question = event.target.closest("[data-question]");
  if (!question) return;
  if (event.target.matches(".remove-question")) { question.remove(); return; }
  if (event.target.matches(".add-criterion")) {
    const type = question.querySelector('[data-field="type"]').value;
    const row = type === "score" ? `<label class="criterion-row"><span class="criterion-marker"></span><input data-criterion required><button type="button" class="remove-criterion" aria-label="Remove level">×</button></label>` : `<div class="choice-row"><input data-label aria-label="Choice label" required><input data-meaning aria-label="Choice meaning"><button type="button" class="remove-criterion" aria-label="Remove choice">×</button></div>`;
    question.querySelector(".criteria-rows").insertAdjacentHTML("beforeend", row);
  }
  if (event.target.matches(".remove-criterion")) event.target.closest(".criterion-row, .choice-row").remove();
});
questionsList.addEventListener("change", (event) => {
  if (!event.target.matches('[data-field="type"]')) return;
  const question = event.target.closest("[data-question]");
  const instructions = question.querySelector('[data-field="instructions"]').value;
  question.querySelector("[data-criteria]").innerHTML = criteriaMarkup({ type: event.target.value, instructions, criteria: event.target.value === "choice" ? [["option", ""]] : event.target.value === "score" ? ["Low", "Medium", "High"] : [] });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault(); clearError();
  const state = stateInput.value.trim();
  const questions = currentQuestions();
  if (!state || !questions.length || questions.some((question) => !question.instructions || (question.type !== "noul" && !question.criteria.length))) { showError("Add a state, instructions, and at least one option or level for every question."); return; }
  setButtonLoading(true);
  const started = performance.now();
  try {
    const response = await fetch("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, questions }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "The model could not answer this request.");
    renderResults(payload);
    latency.textContent = `${Math.round(performance.now() - started)} ms · ${payload.usage?.input_tokens ?? 0} input tokens`;
  } catch (error) { showError(error.message); } finally { setButtonLoading(false); }
});

initialQuestions.forEach(renderQuestion);
updateCount();
checkService("/health", "health-dot", "health-label");
checkService("/ready", "ready-dot", "ready-label");
setInterval(() => checkService("/ready", "ready-dot", "ready-label"), 4000);
