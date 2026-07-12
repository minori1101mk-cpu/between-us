(() => {
  "use strict";

  const PEOPLE = ["Minori", "Kulsoom"];

  const STORAGE_KEYS = {
    activeUser: "between-us-active-user",
    accessGranted: "between-us-access-granted"
  };

  const config = window.APP_CONFIG || {};

  const hasConfig =
    config.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("PASTE_") &&
    !config.SUPABASE_ANON_KEY.includes("PASTE_");

  const db = hasConfig
    ? window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY
      )
    : null;

  const state = {
    activeUser: localStorage.getItem(STORAGE_KEYS.activeUser) || null,
    pendingUser: null,
    selectedMonth: startOfMonth(new Date()),
    expenses: [],
    settlements: [],
    latestFullSettlement: null,
    currentCycleExpenses: [],
    currentCycleSettlements: [],
    detailsFilter: "all",
    realtimeChannel: null,
    confirmAction: null,
    refreshTimer: null
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    welcomeView: $("#welcomeView"),
    dashboardView: $("#dashboardView"),

    pinDialog: $("#pinDialog"),
    pinForm: $("#pinForm"),
    pinInput: $("#pinInput"),
    pinError: $("#pinError"),

    greeting: $("#greeting"),
    activeUserName: $("#activeUserName"),
    activeUserAvatar: $("#activeUserAvatar"),
    switchUserButton: $("#switchUserButton"),

    previousMonthButton: $("#previousMonthButton"),
    nextMonthButton: $("#nextMonthButton"),
    monthPickerButton: $("#monthPickerButton"),
    monthInput: $("#monthInput"),
    monthLabel: $("#monthLabel"),

    balanceHeadline: $("#balanceHeadline"),
    balanceBadge: $("#balanceBadge"),
    balanceAmount: $("#balanceAmount"),
    balanceDirection: $("#balanceDirection"),

    minoriPaid: $("#minoriPaid"),
    kulsoomPaid: $("#kulsoomPaid"),
    minoriOutstanding: $("#minoriOutstanding"),
    kulsoomOutstanding: $("#kulsoomOutstanding"),

    recentActivity: $("#recentActivity"),

    addExpenseButton: $("#addExpenseButton"),
    expenseDialog: $("#expenseDialog"),
    expenseForm: $("#expenseForm"),
    expenseDate: $("#expenseDate"),
    expensePlace: $("#expensePlace"),
    expenseAmount: $("#expenseAmount"),
    expenseError: $("#expenseError"),

    settleButton: $("#settleButton"),
    settleDialog: $("#settleDialog"),
    settleForm: $("#settleForm"),
    settlementFrom: $("#settlementFrom"),
    settlementTo: $("#settlementTo"),
    settlementAmount: $("#settlementAmount"),
    partialSettlementFields: $("#partialSettlementFields"),
    fullSettlementMessage: $("#fullSettlementMessage"),
    fullSettlementTitle: $("#fullSettlementTitle"),
    fullSettlementText: $("#fullSettlementText"),
    settlementSubmitButton: $("#settlementSubmitButton"),
    settleError: $("#settleError"),

    openDetailsButton: $("#openDetailsButton"),
    detailsDialog: $("#detailsDialog"),
    detailsTitle: $("#detailsTitle"),
    detailsList: $("#detailsList"),

    confirmDialog: $("#confirmDialog"),
    confirmTitle: $("#confirmTitle"),
    confirmMessage: $("#confirmMessage"),
    confirmCancel: $("#confirmCancel"),
    confirmAction: $("#confirmAction"),

    toast: $("#toast")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    setGreeting();

    elements.expenseDate.value = toLocalDateInput(new Date());

    if (!hasConfig) {
      showToast(
        "Add your Supabase URL and key to config.js first.",
        true
      );
      showWelcome();
      return;
    }

    try {
      const { data: sessionData } = await db.auth.getSession();

      if (!sessionData.session) {
        const { error } = await db.auth.signInAnonymously();

        if (error) {
          throw error;
        }
      }

      if (
        state.activeUser &&
        localStorage.getItem(STORAGE_KEYS.accessGranted) === "true"
      ) {
        const hasMembership = await verifyMembership();

        if (hasMembership) {
          await enterDashboard(state.activeUser);
          return;
        }
      }

      localStorage.removeItem(STORAGE_KEYS.accessGranted);
      showWelcome();
    } catch (error) {
      console.error(error);
      showToast(readableError(error), true);
      showWelcome();
    }
  }

  function bindEvents() {
    $$(".profile-card").forEach((button) => {
      button.addEventListener("click", () => {
        selectProfile(button.dataset.profile);
      });
    });

    $$(".close-dialog").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest("dialog").close();
      });
    });

    elements.pinForm.addEventListener("submit", handlePinSubmit);

    elements.switchUserButton.addEventListener("click", switchUser);

    elements.previousMonthButton.addEventListener("click", () => {
      changeMonth(-1);
    });

    elements.nextMonthButton.addEventListener("click", () => {
      changeMonth(1);
    });

    elements.monthPickerButton.addEventListener("click", () => {
      elements.monthInput.value =
        formatMonthInput(state.selectedMonth);

      if (typeof elements.monthInput.showPicker === "function") {
        elements.monthInput.showPicker();
      } else {
        elements.monthInput.click();
      }
    });

    elements.monthInput.addEventListener(
      "change",
      handleMonthInput
    );

    elements.addExpenseButton.addEventListener(
      "click",
      openExpenseDialog
    );

    elements.expenseForm.addEventListener(
      "submit",
      saveExpense
    );

    elements.settleButton.addEventListener(
      "click",
      openSettleDialog
    );

    elements.settleForm.addEventListener(
      "submit",
      saveSettlement
    );

    $$('input[name="settlementMode"]').forEach((radio) => {
      radio.addEventListener(
        "change",
        updateSettlementMode
      );
    });

    elements.settlementFrom.addEventListener(
      "change",
      keepSettlementPeopleDifferent
    );

    elements.settlementTo.addEventListener(
      "change",
      keepSettlementPeopleDifferent
    );

    elements.openDetailsButton.addEventListener(
      "click",
      openDetailsDialog
    );

    $$(".details-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.detailsFilter = button.dataset.filter;

        $$(".details-tab").forEach((tab) => {
          tab.classList.toggle(
            "active",
            tab === button
          );
        });

        renderDetails();
      });
    });

    elements.confirmCancel.addEventListener(
      "click",
      () => elements.confirmDialog.close()
    );

    elements.confirmAction.addEventListener(
      "click",
      async () => {
        if (state.confirmAction) {
          await state.confirmAction();
        }

        elements.confirmDialog.close();
      }
    );

    window.addEventListener("online", () => {
      showToast("Back online.");
      scheduleRefresh();
    });

    window.addEventListener("offline", () => {
      showToast("You are offline.", true);
    });
  }

  function selectProfile(profile) {
    state.pendingUser = profile;

    elements.pinError.textContent = "";
    elements.pinInput.value = "";

    elements.pinDialog.showModal();

    setTimeout(() => {
      elements.pinInput.focus();
    }, 50);
  }

  async function handlePinSubmit(event) {
    event.preventDefault();

    elements.pinError.textContent = "";

    const pin = elements.pinInput.value.trim();

    if (!state.pendingUser || pin.length < 4) {
      elements.pinError.textContent =
        "Enter the shared PIN.";
      return;
    }

    const button =
      elements.pinForm.querySelector(".primary-button");

    setButtonLoading(
      button,
      true,
      "Unlocking…"
    );

    try {
      const { error } = await db.rpc(
        "join_household",
        {
          requested_name: state.pendingUser,
          supplied_pin: pin
        }
      );

      if (error) {
        throw error;
      }

      state.activeUser = state.pendingUser;

      localStorage.setItem(
        STORAGE_KEYS.activeUser,
        state.activeUser
      );

      localStorage.setItem(
        STORAGE_KEYS.accessGranted,
        "true"
      );

      elements.pinDialog.close();

      await enterDashboard(state.activeUser);
    } catch (error) {
      console.error(error);

      elements.pinError.textContent =
        error.message?.includes("Invalid profile or PIN")
          ? "That PIN is not correct."
          : readableError(error);
    } finally {
      setButtonLoading(
        button,
        false,
        "Unlock"
      );
    }
  }

  async function verifyMembership() {
    const { data, error } = await db.rpc(
      "has_household_membership"
    );

    if (error) {
      console.warn(error);
      return false;
    }

    return Boolean(data);
  }

  async function enterDashboard(profile) {
    state.activeUser = profile;

    localStorage.setItem(
      STORAGE_KEYS.activeUser,
      profile
    );

    elements.welcomeView.classList.add("hidden");
    elements.dashboardView.classList.remove("hidden");

    elements.activeUserName.textContent = profile;
    elements.activeUserAvatar.textContent =
      profile.charAt(0);

    elements.activeUserAvatar.className =
      `avatar avatar-small ${
        profile === "Minori"
          ? "avatar-minori"
          : "avatar-kulsoom"
      }`;

    updateMonthLabels();
    subscribeToChanges();

    await refreshData();
  }

  function showWelcome() {
    elements.dashboardView.classList.add("hidden");
    elements.welcomeView.classList.remove("hidden");
  }

  function switchUser() {
    state.activeUser = null;
    state.pendingUser = null;

    localStorage.removeItem(
      STORAGE_KEYS.activeUser
    );

    showWelcome();
  }

  function changeMonth(offset) {
    state.selectedMonth = new Date(
      state.selectedMonth.getFullYear(),
      state.selectedMonth.getMonth() + offset,
      1
    );

    updateMonthLabels();
    refreshData();
  }

  function handleMonthInput() {
    if (!elements.monthInput.value) {
      return;
    }

    const [year, month] =
      elements.monthInput.value
        .split("-")
        .map(Number);

    state.selectedMonth = new Date(
      year,
      month - 1,
      1
    );

    updateMonthLabels();
    refreshData();
  }

  function updateMonthLabels() {
    const label =
      state.selectedMonth.toLocaleDateString(
        "en-US",
        {
          month: "long",
          year: "numeric"
        }
      );

    elements.monthLabel.textContent = label;
    elements.detailsTitle.textContent = label;
  }

  async function refreshData() {
    if (!db) {
      return;
    }

    renderLoading();

    const {
      startIso,
      endIso,
      dateStart,
      dateEnd
    } = selectedMonthBounds();

    try {
      const [
        expensesResult,
        settlementsResult
      ] = await Promise.all([
        db
          .from("expenses")
          .select("*")
          .gte("expense_date", dateStart)
          .lt("expense_date", dateEnd)
          .order(
            "created_at",
            { ascending: false }
          ),

        db
          .from("settlements")
          .select("*")
          .gte("created_at", startIso)
          .lt("created_at", endIso)
          .order(
            "created_at",
            { ascending: false }
          )
      ]);

      if (expensesResult.error) {
        throw expensesResult.error;
      }

      if (settlementsResult.error) {
        throw settlementsResult.error;
      }

      state.expenses =
        expensesResult.data || [];

      state.settlements =
        settlementsResult.data || [];

      state.latestFullSettlement =
        state.settlements.find(
          (item) => item.is_full
        ) || null;

      const cutoff =
        state.latestFullSettlement?.created_at || null;

      state.currentCycleExpenses =
        state.expenses.filter((item) => {
          return (
            !cutoff ||
            new Date(item.created_at) >
              new Date(cutoff)
          );
        });

      state.currentCycleSettlements =
        state.settlements.filter((item) => {
          return (
            !item.is_full &&
            (
              !cutoff ||
              new Date(item.created_at) >
                new Date(cutoff)
            )
          );
        });

      renderDashboard();

      if (elements.detailsDialog.open) {
        renderDetails();
      }
    } catch (error) {
      console.error(error);

      showToast(
        readableError(error),
        true
      );

      renderDataError();
    }
  }

  function calculateCycle() {
    const paid = {
      Minori: 0,
      Kulsoom: 0
    };

    state.currentCycleExpenses.forEach(
      (expense) => {
        paid[expense.paid_by] +=
          Number(expense.amount);
      }
    );

    const total =
      paid.Minori + paid.Kulsoom;

    const fairShare =
      total / 2;

    let minoriNet =
      paid.Minori - fairShare;

    state.currentCycleSettlements.forEach(
      (settlement) => {
        const amount =
          Number(settlement.amount);

        if (
          settlement.from_person === "Minori"
        ) {
          minoriNet -= amount;
        }

        if (
          settlement.to_person === "Minori"
        ) {
          minoriNet += amount;
        }
      }
    );

    if (Math.abs(minoriNet) < 0.5) {
      minoriNet = 0;
    }

    const creditor =
      minoriNet > 0
        ? "Minori"
        : minoriNet < 0
        ? "Kulsoom"
        : null;

    const debtor =
      minoriNet > 0
        ? "Kulsoom"
        : minoriNet < 0
        ? "Minori"
        : null;

    const outstandingAmount =
      Math.round(Math.abs(minoriNet));

    return {
      paid,
      total,
      creditor,
      debtor,
      outstandingAmount,

      outstanding: {
        Minori:
          creditor === "Minori"
            ? outstandingAmount
            : 0,

        Kulsoom:
          creditor === "Kulsoom"
            ? outstandingAmount
            : 0
      }
    };
  }

  function renderDashboard() {
    const cycle = calculateCycle();

    elements.minoriPaid.textContent =
      yen(cycle.paid.Minori);

    elements.kulsoomPaid.textContent =
      yen(cycle.paid.Kulsoom);

    elements.minoriOutstanding.textContent =
      yen(cycle.outstanding.Minori);

    elements.kulsoomOutstanding.textContent =
      yen(cycle.outstanding.Kulsoom);

    if (!cycle.creditor) {
      elements.balanceHeadline.textContent =
        "You are all settled";

      elements.balanceBadge.textContent =
        "SETTLED";

      elements.balanceAmount.textContent =
        "¥0";

      elements.balanceDirection.textContent =
        "Nothing to transfer";

      elements.settleButton.disabled = true;

      elements.settleButton.textContent =
        "All settled";
    } else {
      elements.balanceHeadline.textContent =
        `${cycle.creditor} is owed`;

      elements.balanceBadge.textContent =
        "OPEN";

      elements.balanceAmount.textContent =
        yen(cycle.outstandingAmount);

      elements.balanceDirection.textContent =
        `${cycle.debtor} → ${cycle.creditor}`;

      elements.settleButton.disabled = false;

      elements.settleButton.textContent =
        "Settle up";
    }

    renderRecentActivity();
  }

  function renderRecentActivity() {
    const items =
      combinedMonthlyActivity().slice(0, 5);

    if (!items.length) {
      elements.recentActivity.innerHTML =
        emptyState(
          "No activity yet",
          "Add your first shared expense for this month."
        );

      return;
    }

    elements.recentActivity.innerHTML =
      items.map(activityItemHtml).join("");
  }

  function combinedMonthlyActivity() {
    const expenseItems =
      state.expenses.map((item) => ({
        ...item,
        entryType: "expense",
        sortDate: item.created_at
      }));

    const settlementItems =
      state.settlements.map((item) => ({
        ...item,
        entryType: "settlement",
        sortDate: item.created_at
      }));

    return [
      ...expenseItems,
      ...settlementItems
    ].sort((a, b) => {
      return (
        new Date(b.sortDate) -
        new Date(a.sortDate)
      );
    });
  }

  function activityItemHtml(
    item,
    includeDelete = false
  ) {
    if (item.entryType === "expense") {
      const date =
        formatDate(item.expense_date);

      return `
        <article class="activity-item">

          <span
            class="activity-icon"
            aria-hidden="true"
          >
            ↗
          </span>

          <div class="activity-main">
            <strong>
              ${escapeHtml(item.place)}
            </strong>

            <small>
              ${date}
              · Paid by
              ${escapeHtml(item.paid_by)}
            </small>
          </div>

          <div class="activity-amount">
            <strong>
              ${yen(item.amount)}
            </strong>

            <small>
              expense
            </small>
          </div>

          ${
            includeDelete
              ? deleteButtonHtml(
                  "expense",
                  item.id
                )
              : ""
          }

        </article>
      `;
    }

    const isFull = item.is_full;

    return `
      <article class="activity-item">

        <span
          class="activity-icon"
          aria-hidden="true"
        >
          ${isFull ? "✓" : "↔"}
        </span>

        <div class="activity-main">

          <strong>
            ${
              isFull
                ? "Full settlement"
                : "Partial settlement"
            }
          </strong>

          <small>
            ${formatDateTime(item.created_at)}
            ·
            ${escapeHtml(item.from_person)}
            →
            ${escapeHtml(item.to_person)}
          </small>

        </div>

        <div class="activity-amount">

          <strong>
            ${yen(item.amount)}
          </strong>

          <small>
            settled
          </small>

        </div>

        ${
          includeDelete
            ? deleteButtonHtml(
                "settlement",
                item.id
              )
            : ""
        }

      </article>
    `;
  }

  function deleteButtonHtml(type, id) {
    return `
      <button
        class="delete-entry-button"
        data-delete-type="${type}"
        data-delete-id="${id}"
        type="button"
        aria-label="Delete entry"
      >
        ⌫
      </button>
    `;
  }

  function renderLoading() {
    elements.recentActivity.innerHTML = `
      <div class="loading-shimmer"></div>
      <div class="loading-shimmer"></div>
    `;
  }

  function renderDataError() {
    elements.recentActivity.innerHTML =
      emptyState(
        "Could not load data",
        "Check your connection and Supabase setup."
      );
  }

  function openExpenseDialog() {
    elements.expenseError.textContent = "";

    elements.expenseForm.reset();

    elements.expenseDate.value =
      toLocalDateInput(new Date());

    const selectedRadio =
      elements.expenseForm.querySelector(
        `input[name="paidBy"][value="${state.activeUser}"]`
      );

    if (selectedRadio) {
      selectedRadio.checked = true;
    }

    elements.expenseDialog.showModal();

    setTimeout(() => {
      elements.expensePlace.focus();
    }, 50);
  }

  async function saveExpense(event) {
    event.preventDefault();

    elements.expenseError.textContent = "";

    const date =
      elements.expenseDate.value;

    const place =
      elements.expensePlace.value.trim();

    const amount =
      Number(elements.expenseAmount.value);

    const paidBy =
      elements.expenseForm.querySelector(
        'input[name="paidBy"]:checked'
      )?.value;

    if (
      !date ||
      !place ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      !PEOPLE.includes(paidBy)
    ) {
      elements.expenseError.textContent =
        "Complete every field with a valid amount.";

      return;
    }

    const button =
      elements.expenseForm.querySelector(
        ".primary-button"
      );

    setButtonLoading(
      button,
      true,
      "Saving…"
    );

    try {
      const { error } =
        await db
          .from("expenses")
          .insert({
            expense_date: date,
            place,
            amount,
            paid_by: paidBy,
            entered_by: state.activeUser
          });

      if (error) {
        throw error;
      }

      elements.expenseDialog.close();

      showToast("Expense saved.");

      await refreshData();
    } catch (error) {
      console.error(error);

      elements.expenseError.textContent =
        readableError(error);
    } finally {
      setButtonLoading(
        button,
        false,
        "Save expense"
      );
    }
  }

  function openSettleDialog() {
    const cycle = calculateCycle();

    if (!cycle.creditor) {
      showToast(
        "There is nothing to settle."
      );

      return;
    }

    elements.settleForm.reset();

    elements.settleError.textContent = "";

    elements.settlementFrom.value =
      cycle.debtor;

    elements.settlementTo.value =
      cycle.creditor;

    elements.settlementAmount.value =
      cycle.outstandingAmount;

    elements.settlementAmount.max =
      cycle.outstandingAmount;

    elements.fullSettlementTitle.textContent =
      `${cycle.debtor} pays ${cycle.creditor} ${yen(
        cycle.outstandingAmount
      )}.`;

    elements.fullSettlementText.textContent =
      "This saves a full-settlement record and starts a new cycle for this month.";

    updateSettlementMode();

    elements.settleDialog.showModal();
  }

  function updateSettlementMode() {
    const mode =
      elements.settleForm.querySelector(
        'input[name="settlementMode"]:checked'
      )?.value;

    const isFull =
      mode === "full";

    elements.partialSettlementFields
      .classList
      .toggle(
        "hidden",
        isFull
      );

    elements.fullSettlementMessage
      .classList
      .toggle(
        "hidden",
        !isFull
      );

    elements.settlementSubmitButton.textContent =
      isFull
        ? "Settle in full"
        : "Save partial settlement";
  }

  function keepSettlementPeopleDifferent(event) {
    if (
      elements.settlementFrom.value ===
      elements.settlementTo.value
    ) {
      if (
        event.target ===
        elements.settlementFrom
      ) {
        elements.settlementTo.value =
          elements.settlementFrom.value ===
          "Minori"
            ? "Kulsoom"
            : "Minori";
      } else {
        elements.settlementFrom.value =
          elements.settlementTo.value ===
          "Minori"
            ? "Kulsoom"
            : "Minori";
      }
    }
  }

  async function saveSettlement(event) {
    event.preventDefault();

    elements.settleError.textContent = "";

    const cycle = calculateCycle();

    if (
      !cycle.creditor ||
      cycle.outstandingAmount <= 0
    ) {
      elements.settleError.textContent =
        "There is nothing to settle.";

      return;
    }

    const mode =
      elements.settleForm.querySelector(
        'input[name="settlementMode"]:checked'
      )?.value;

    const isFull =
      mode === "full";

    const from =
      isFull
        ? cycle.debtor
        : elements.settlementFrom.value;

    const to =
      isFull
        ? cycle.creditor
        : elements.settlementTo.value;

    const amount =
      isFull
        ? cycle.outstandingAmount
        : Number(
            elements.settlementAmount.value
          );

    if (
      !PEOPLE.includes(from) ||
      !PEOPLE.includes(to) ||
      from === to
    ) {
      elements.settleError.textContent =
        "Choose two different people.";

      return;
    }

    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      elements.settleError.textContent =
        "Enter a valid whole-yen amount.";

      return;
    }

    if (
      from !== cycle.debtor ||
      to !== cycle.creditor
    ) {
      elements.settleError.textContent =
        `Based on the current balance, ${cycle.debtor} should pay ${cycle.creditor}.`;

      return;
    }

    if (
      amount >
      cycle.outstandingAmount
    ) {
      elements.settleError.textContent =
        `The maximum outstanding amount is ${yen(
          cycle.outstandingAmount
        )}.`;

      return;
    }

    const button =
      elements.settlementSubmitButton;

    setButtonLoading(
      button,
      true,
      "Saving…"
    );

    try {
      const { error } =
        await db
          .from("settlements")
          .insert({
            from_person: from,
            to_person: to,
            amount,
            is_full:
              isFull ||
              amount ===
                cycle.outstandingAmount,
            entered_by:
              state.activeUser
          });

      if (error) {
        throw error;
      }

      elements.settleDialog.close();

      showToast(
        isFull
          ? "Fully settled."
          : "Settlement saved."
      );

      await refreshData();
    } catch (error) {
      console.error(error);

      elements.settleError.textContent =
        readableError(error);
    } finally {
      setButtonLoading(
        button,
        false,
        isFull
          ? "Settle in full"
          : "Save partial settlement"
      );
    }
  }

  function openDetailsDialog() {
    state.detailsFilter = "all";

    $$(".details-tab").forEach((tab) => {
      tab.classList.toggle(
        "active",
        tab.dataset.filter === "all"
      );
    });

    renderDetails();

    elements.detailsDialog.showModal();
  }

  function renderDetails() {
    const all =
      combinedMonthlyActivity();

    const filtered =
      state.detailsFilter === "all"
        ? all
        : all.filter((item) => {
            return (
              item.entryType ===
              state.detailsFilter
            );
          });

    if (!filtered.length) {
      elements.detailsList.innerHTML =
        emptyState(
          "Nothing here",
          "No matching entries for this month."
        );

      return;
    }

    elements.detailsList.innerHTML =
      filtered
        .map((item) => {
          return activityItemHtml(
            item,
            true
          );
        })
        .join("");

    elements.detailsList
      .querySelectorAll(
        ".delete-entry-button"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            requestDelete(
              button.dataset.deleteType,
              button.dataset.deleteId
            );
          }
        );
      });
  }

  function requestDelete(type, id) {
    const collection =
      type === "expense"
        ? state.expenses
        : state.settlements;

    const item =
      collection.find((entry) => {
        return (
          String(entry.id) ===
          String(id)
        );
      });

    if (!item) {
      return;
    }

    elements.confirmTitle.textContent =
      type === "expense"
        ? "Delete this expense?"
        : "Delete this settlement?";

    elements.confirmMessage.textContent =
      type === "expense"
        ? `${item.place} · ${yen(
            item.amount
          )}`
        : `${item.from_person} to ${item.to_person} · ${yen(
            item.amount
          )}`;

    state.confirmAction =
      async () => {
        try {
          const table =
            type === "expense"
              ? "expenses"
              : "settlements";

          const { error } =
            await db
              .from(table)
              .delete()
              .eq("id", id);

          if (error) {
            throw error;
          }

          showToast("Entry deleted.");

          await refreshData();
        } catch (error) {
          console.error(error);

          showToast(
            readableError(error),
            true
          );
        }
      };

    elements.confirmDialog.showModal();
  }

  function subscribeToChanges() {
    if (state.realtimeChannel) {
      db.removeChannel(
        state.realtimeChannel
      );
    }

    state.realtimeChannel =
      db
        .channel("between-us-live")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "expenses"
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "settlements"
          },
          scheduleRefresh
        )
        .subscribe();
  }

  function scheduleRefresh() {
    clearTimeout(
      state.refreshTimer
    );

    state.refreshTimer =
      setTimeout(
        refreshData,
        250
      );
  }

  function selectedMonthBounds() {
    const start = new Date(
      state.selectedMonth.getFullYear(),
      state.selectedMonth.getMonth(),
      1
    );

    const end = new Date(
      state.selectedMonth.getFullYear(),
      state.selectedMonth.getMonth() + 1,
      1
    );

    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      dateStart: toLocalDateInput(start),
      dateEnd: toLocalDateInput(end)
    };
  }

  function setGreeting() {
    const hour =
      new Date().getHours();

    elements.greeting.textContent =
      hour < 12
        ? "GOOD MORNING"
        : hour < 18
        ? "GOOD AFTERNOON"
        : "GOOD EVENING";
  }

  function setButtonLoading(
    button,
    loading,
    label
  ) {
    button.disabled = loading;
    button.textContent = label;
  }

  function startOfMonth(date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      1
    );
  }

  function formatMonthInput(date) {
    return (
      `${date.getFullYear()}-` +
      `${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  function toLocalDateInput(date) {
    const local =
      new Date(
        date.getTime() -
        date.getTimezoneOffset() *
        60000
      );

    return local
      .toISOString()
      .slice(0, 10);
  }

  function formatDate(dateString) {
    return new Date(
      `${dateString}T00:00:00`
    ).toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  }

  function formatDateTime(dateString) {
    return new Date(
      dateString
    ).toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  }

  function yen(value) {
    return new Intl.NumberFormat(
      "ja-JP",
      {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0
      }
    ).format(
      Number(value) || 0
    );
  }

  function emptyState(title, text) {
    return `
      <div class="empty-state">
        <strong>
          ${escapeHtml(title)}
        </strong>

        ${escapeHtml(text)}
      </div>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readableError(error) {
    const message =
      error?.message ||
      "Something went wrong.";

    if (
      message.includes(
        "Anonymous sign-ins are disabled"
      )
    ) {
      return (
        "Enable Anonymous Sign-Ins " +
        "in Supabase Authentication settings."
      );
    }

    if (
      message.includes(
        "Failed to fetch"
      )
    ) {
      return (
        "Could not connect. Check your internet " +
        "connection and Supabase configuration."
      );
    }

    return message;
  }

  let toastTimer;

  function showToast(
    message,
    isError = false
  ) {
    clearTimeout(toastTimer);

    elements.toast.textContent =
      message;

    elements.toast.classList.toggle(
      "error",
      isError
    );

    elements.toast.classList.add(
      "visible"
    );

    toastTimer =
      setTimeout(() => {
        elements.toast.classList.remove(
          "visible"
        );
      }, 3200);
  }
})();
