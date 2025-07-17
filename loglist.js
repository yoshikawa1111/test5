// loglist.js

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("log-list");
  const confirmBtn = document.getElementById("confirm-btn");
  const { owner, repo, apiBase } = window.CCU_CONFIG;
  console.log("CCU_CONFIG:", window.CCU_CONFIG);
  if (!list || !confirmBtn) return;

  // 1回だけリロードさせる（localStorageなどを利用）
  window.addEventListener('load', function() {
    if (!sessionStorage.getItem('reloaded')) {
      sessionStorage.setItem('reloaded', 'true');
      location.reload();
    } else {
      sessionStorage.removeItem('reloaded');
    }
  });

  // 仮データ保持
  let pendingOrder = Array.from(list.children).map(li => li.dataset.path);
  const pendingDeletes = new Set();

  // Sortable 設定
  new Sortable(list, {
    animation: 150,
    // Disable dragging when touching delete buttons or links
    filter: '.btn-delete, a',

    preventOnFilter: true,
    onEnd: () => {
      pendingOrder = Array.from(list.children).map(li => li.dataset.path);
      confirmBtn.disabled = false;
    }
  });
  // Stop pointer events on delete buttons or links from initiating drag
  list.addEventListener('pointerdown', e => {
    if (e.target.closest('.btn-delete') || e.target.closest('a')) {

      e.stopPropagation();
    }
  });

  // 削除トグル
  list.addEventListener("click", e => {
    const btn = e.target.closest(".btn-delete");
    if (!btn) return;
    const li = btn.closest("li");
    const path = li.dataset.path;
    if (pendingDeletes.has(path)) {
      pendingDeletes.delete(path);
      li.classList.remove("list-group-item-danger");
    } else {
      pendingDeletes.add(path);
      li.classList.add("list-group-item-danger");
    }
    confirmBtn.disabled = false;
  });

  // 確定ボタン
  confirmBtn.addEventListener("click", async () => {
    pendingOrder = Array.from(list.children).map(li => li.dataset.path);
    confirmBtn.disabled = true;
    confirmBtn.textContent = "反映中…";

    try {
      // 1) apply-changes を呼び出し
      const resp = await fetch(`https://ccfolialoguploader.com/api/apply-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          owner,
          repo,
          order: pendingOrder,
          deletes: Array.from(pendingDeletes)
        })
      });
      const result = await resp.json();
      if (!resp.ok || !result.ok) {
        const errText = result.error || (await resp.text());
        throw new Error(errText);
      }

      // 2) 新しいコミット SHA を取得
      const commitSha = result.commit;
      if (!commitSha) {
        throw new Error("コミット SHA が返ってきませんでした");
      }

      // 3) ポーリングしてビルド完了を待機
      await waitForBuildCompletion(owner, repo, commitSha);

      // 4) 完了後にリロード
      location.reload();

    } catch (err) {
      console.error("Apply changes failed:", err);
      alert("反映に失敗しました: " + err.message);
      confirmBtn.disabled = false;
      confirmBtn.textContent = "確定";
    }
  });

  // ビルド完了ポーリング関数
  async function waitForBuildCompletion(owner, repo, commit) {
    const POLL_INTERVAL = 5000;
    while (true) {
      const res = await fetch(`https://ccfolialoguploader.com/api/pages-status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, commit })
      });
      const data = await res.json();
      if (data.ok && data.done) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }
});
