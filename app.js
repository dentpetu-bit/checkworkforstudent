(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  let supabaseClient = null;
  let currentStudent = null;
  let currentPeriod = 'pre';
  let assignments = [];
  let scoreMap = new Map();

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function round2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function formatScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : String(round2(n));
  }

  function setConnection(text, ok = true) {
    const el = $('connectionStatus');
    if (!el) return;
    el.classList.toggle('error', !ok);
    el.querySelector('span:last-child').textContent = text;
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__scoreToastTimer);
    window.__scoreToastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function showError(message) {
    const el = $('lookupError');
    el.textContent = message;
    el.hidden = false;
  }

  function clearError() {
    $('lookupError').hidden = true;
    $('lookupError').textContent = '';
  }

  function setLoading(loading) {
    const button = $('lookupBtn');
    button.disabled = loading;
    button.classList.toggle('loading', loading);
    $('studentCode').disabled = loading;
  }

  function normalizeStudentCode(value) {
    return String(value || '').trim().replace(/^student:/i, '').replace(/^score:/i, '');
  }

  async function init() {
    bindEvents();

    if (!window.supabase) {
      setConnection('เชื่อมต่อไม่สำเร็จ', false);
      showError('โหลดระบบ Supabase ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต');
      return;
    }

    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      setConnection('ยังไม่ได้ตั้งค่า', false);
      showError('ไม่พบการตั้งค่า Supabase ใน config.js');
      return;
    }

    try {
      supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      const { error } = await supabaseClient.from('students').select('id').limit(1);
      if (error) throw error;
      setConnection('ระบบพร้อมใช้งาน', true);
    } catch (error) {
      console.error(error);
      setConnection('เชื่อมต่อไม่สำเร็จ', false);
      showError('เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  }

  function bindEvents() {
    $('lookupForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      await lookupStudent();
    });

    $('changeStudentBtn').addEventListener('click', resetLookup);

    document.querySelectorAll('.period-tab').forEach((button) => {
      button.addEventListener('click', () => setPeriod(button.dataset.period));
    });
  }

  async function lookupStudent() {
    if (!supabaseClient) {
      showError('ระบบยังไม่พร้อม กรุณารีเฟรชหน้าเว็บ');
      return;
    }

    const code = normalizeStudentCode($('studentCode').value);
    clearError();

    if (!code) {
      showError('กรุณากรอกรหัสนักเรียน');
      $('studentCode').focus();
      return;
    }

    setLoading(true);

    try {
      const { data: student, error: studentError } = await supabaseClient
        .from('students')
        .select('id,student_code,prefix,full_name,room,number')
        .eq('student_code', code)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!student) {
        showError(`ไม่พบรหัสนักเรียน ${code} กรุณาตรวจสอบรหัสอีกครั้ง`);
        return;
      }

      const { data: roomAssignments, error: assignmentError } = await supabaseClient
        .from('assignments')
        .select('id,title,max_score,sort_order,period,room')
        .eq('room', student.room)
        .order('sort_order', { ascending: true });

      if (assignmentError) throw assignmentError;

      const { data: scores, error: scoreError } = await supabaseClient
        .from('scores')
        .select('assignment_id,score,updated_at')
        .eq('student_id', student.id);

      if (scoreError) throw scoreError;

      currentStudent = student;
      assignments = roomAssignments || [];
      scoreMap = new Map((scores || []).map((row) => [row.assignment_id, row]));
      currentPeriod = 'pre';

      renderStudent();
      updateCounts();
      setPeriod('pre');

      $('lookupView').hidden = true;
      $('resultView').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error(error);
      showError('เกิดข้อผิดพลาดในการโหลดคะแนน กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }

  function renderStudent() {
    if (!currentStudent) return;

    const fullName = `${currentStudent.prefix || ''}${currentStudent.full_name || ''}`.trim();
    $('studentName').textContent = fullName || '-';
    $('studentRoom').textContent = `ห้อง ${currentStudent.room || '-'}`;
    $('studentNumber').textContent = `เลขที่ ${currentStudent.number ?? '-'}`;
    $('studentCodeLabel').textContent = `รหัส ${currentStudent.student_code || '-'}`;

    const name = String(currentStudent.full_name || '').trim();
    $('studentInitial').textContent = name ? name.slice(0, 1) : 'นร';
  }

  function updateCounts() {
    const pre = assignments.filter((a) => (a.period || 'pre') === 'pre').length;
    const post = assignments.filter((a) => (a.period || 'pre') === 'post').length;
    $('preCount').textContent = `${pre} ชิ้นงาน`;
    $('postCount').textContent = `${post} ชิ้นงาน`;
  }

  function setPeriod(period) {
    currentPeriod = period === 'post' ? 'post' : 'pre';

    document.querySelectorAll('.period-tab').forEach((button) => {
      const active = button.dataset.period === currentPeriod;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    $('periodTitle').textContent = currentPeriod === 'post'
      ? 'คะแนนหลังกลางภาค'
      : 'คะแนนก่อนกลางภาค';

    renderScores();
  }

  function renderScores() {
    const list = assignments
      .filter((a) => (a.period || 'pre') === currentPeriod)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

    const scoreList = $('scoreList');
    const empty = $('emptyScores');

    if (!list.length) {
      scoreList.innerHTML = '';
      empty.hidden = false;
      updateSummary(list);
      $('updatedLabel').textContent = 'ข้อมูลล่าสุดจากระบบ';
      return;
    }

    empty.hidden = true;

    scoreList.innerHTML = list.map((assignment, index) => {
      const row = scoreMap.get(assignment.id);
      const recorded = Boolean(row);
      const score = recorded ? Number(row.score) : null;
      const max = Number(assignment.max_score) || 0;
      const isZero = recorded && score === 0;
      const isFull = recorded && max > 0 && score === max;

      let statusClass = 'pending';
      let statusText = 'ยังไม่บันทึก';
      if (recorded) {
        statusClass = isZero ? 'zero' : (isFull ? 'full' : 'recorded');
        statusText = isFull ? 'คะแนนเต็ม' : 'บันทึกแล้ว';
      }

      return `
        <article class="score-item ${statusClass}">
          <div class="work-number">${index + 1}</div>
          <div class="work-detail">
            <h4>${escapeHtml(assignment.title)}</h4>
            <span class="status ${statusClass}">${statusText}</span>
          </div>
          <div class="score-value">
            <strong>${recorded ? escapeHtml(formatScore(score)) : '—'}</strong>
            <span>/ ${escapeHtml(formatScore(max))}</span>
          </div>
        </article>
      `;
    }).join('');

    updateSummary(list);

    const timestamps = list
      .map((a) => scoreMap.get(a.id)?.updated_at)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));

    if (timestamps.length) {
      const latest = new Date(Math.max(...timestamps.map((date) => date.getTime())));
      $('updatedLabel').textContent = `อัปเดตล่าสุด ${latest.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
      $('updatedLabel').textContent = 'ยังไม่มีคะแนนที่บันทึก';
    }
  }

  function updateSummary(list) {
    let got = 0;
    let max = 0;
    let recordedCount = 0;

    list.forEach((assignment) => {
      max += Number(assignment.max_score) || 0;
      const row = scoreMap.get(assignment.id);
      if (row) {
        got += Number(row.score) || 0;
        recordedCount += 1;
      }
    });

    $('summaryGot').textContent = formatScore(got);
    $('summaryMax').textContent = formatScore(max);
    $('summaryRecorded').textContent = `${recordedCount}/${list.length}`;
    $('summaryMaxSub').textContent = `${list.length} ชิ้นงาน`;
    $('summaryGotSub').textContent = recordedCount
      ? `จาก ${recordedCount} งานที่มีคะแนน`
      : 'ยังไม่มีคะแนนที่บันทึก';
  }

  function resetLookup() {
    currentStudent = null;
    assignments = [];
    scoreMap = new Map();
    currentPeriod = 'pre';

    $('resultView').hidden = true;
    $('lookupView').hidden = false;
    $('studentCode').value = '';
    clearError();
    $('studentCode').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('error', (event) => {
    console.error(event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    showToast('การเชื่อมต่อมีปัญหา กรุณาลองใหม่');
  });

  document.addEventListener('DOMContentLoaded', init);
})();
