const SPREADSHEET_ID = "여기에_스프레드시트_ID를_입력";
const CAREERNET_API_KEY = "여기에_커리어넷_API_KEY를_입력";
const CAREERNET_ENDPOINT = "https://www.career.go.kr/cnet/openapi/getOpenApi";

function doGet(e) {
  const action = e.parameter.action || "";
  const callback = e.parameter.callback || "";
  let result;

  try {
    if (action === "major_search") {
      result = {
        ok: true,
        results: searchCareerNetMajors_(e.parameter.q || "")
      };
    } else {
      result = { ok: false, message: "지원하지 않는 action입니다." };
    }
  } catch (error) {
    result = { ok: false, message: error.message };
  }

  const json = JSON.stringify(result);
  const output = callback ? `${callback}(${json});` : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents || "{}");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const action = data.action || "unknown";
  const payload = data.payload || {};

  appendRawLog_(ss, action, data);

  if (action === "counsel_request") {
    appendCounselRequest_(ss, payload.request);
    sendTeacherMail_(data.teacherEmail, payload.notification);
  }

  if (action === "applications_update") {
    upsertApplications_(ss, payload);
  }

  if (action === "career_update") {
    appendCareer_(ss, payload);
  }

  if (action === "counsel_record") {
    appendRecord_(ss, payload.record);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, action, receivedAt: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function searchCareerNetMajors_(query) {
  const normalizedQuery = normalizeText_(query);
  if (!normalizedQuery) return [];

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cacheSheet = ensureCareerNetMajorCache_(ss);
  const values = cacheSheet.getDataRange().getValues();
  const rows = values.slice(1);
  const tokens = query.split(/\s+/).filter(Boolean).map(normalizeText_);

  return rows
    .map((row) => ({
      college: row[0],
      major: row[1],
      region: row[2],
      field: row[3],
      majorSeq: row[4]
    }))
    .filter((item) => {
      const haystack = [
        item.college,
        item.major,
        item.region,
        item.field,
        item.college.replace(/대학교$/, "대"),
        item.major.replace(/학과$/, "").replace(/학부$/, "").replace(/전공$/, "")
      ].map(normalizeText_).join(" ");
      return tokens.every((token) => haystack.indexOf(token) !== -1);
    })
    .sort((a, b) => scoreMajorResult_(b, query) - scoreMajorResult_(a, query) || String(a.college).localeCompare(String(b.college), "ko") || String(a.major).localeCompare(String(b.major), "ko"))
    .slice(0, 50);
}

function ensureCareerNetMajorCache_(ss, forceRefresh) {
  const sheet = getSheet_(ss, "대학학과API캐시", ["대학", "학과", "지역", "계열", "majorSeq", "갱신시각"]);
  if (sheet.getLastRow() > 1 && !forceRefresh) return sheet;

  if (forceRefresh && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  if (!CAREERNET_API_KEY || CAREERNET_API_KEY.indexOf("여기에_") === 0) {
    throw new Error("Apps Script의 CAREERNET_API_KEY를 입력해야 합니다.");
  }

  const majors = fetchCareerNetMajorList_();
  const rows = [];
  const batchSize = 30;

  for (let start = 0; start < majors.length; start += batchSize) {
    const batch = majors.slice(start, start + batchSize);
    const requests = batch.map((major) => ({
      url: careerNetUrl_({
        svcType: "api",
        svcCode: "MAJOR_VIEW",
        contentType: "json",
        gubun: "univ_list",
        majorSeq: major.majorSeq
      }),
      muteHttpExceptions: true
    }));

    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach((response, index) => {
      const major = batch[index];
      if (response.getResponseCode() !== 200) return;
      const data = JSON.parse(response.getContentText());
      const detail = data.dataSearch || data;
      const schools = extractArray_(detail.content || detail.schoolList || detail.univList);
      schools.forEach((school) => {
        const college = school.schoolName || school.univName || school.korName || school.name || "";
        if (!college) return;
        rows.push([
          college,
          major.majorName,
          school.area || school.region || school.adres || "",
          major.lClass || major.mClass || "",
          major.majorSeq,
          new Date()
        ]);
      });
    });
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return sheet;
}

function refreshCareerNetMajorCache() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureCareerNetMajorCache_(ss, true);
}

function installDailyMajorCacheTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "refreshCareerNetMajorCache")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("refreshCareerNetMajorCache")
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();
}

function fetchCareerNetMajorList_() {
  const response = UrlFetchApp.fetch(careerNetUrl_({
    svcType: "api",
    svcCode: "MAJOR",
    contentType: "json",
    gubun: "univ_list",
    perPage: 1000
  }), { muteHttpExceptions: true });

  if (response.getResponseCode() !== 200) {
    throw new Error("커리어넷 학과 목록 API 호출에 실패했습니다.");
  }

  const data = JSON.parse(response.getContentText());
  const content = extractArray_(data.dataSearch && data.dataSearch.content);
  return content.map((item) => ({
    majorSeq: item.majorSeq || item.majorseq || item.seq,
    majorName: item.major || item.majorName || item.mClass || item.title || "",
    lClass: item.lClass || item.largeClass || "",
    mClass: item.mClass || item.middleClass || ""
  })).filter((item) => item.majorSeq && item.majorName);
}

function careerNetUrl_(params) {
  const query = Object.assign({ apiKey: CAREERNET_API_KEY }, params);
  return CAREERNET_ENDPOINT + "?" + Object.keys(query)
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(query[key]))
    .join("&");
}

function extractArray_(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeText_(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/대학교/g, "대")
    .replace(/학과/g, "")
    .replace(/학부/g, "")
    .replace(/전공/g, "");
}

function scoreMajorResult_(item, query) {
  const normalizedQuery = normalizeText_(query);
  const college = normalizeText_(item.college);
  const major = normalizeText_(item.major);
  let score = 0;
  if (college === normalizedQuery) score += 100;
  if (college.startsWith(normalizedQuery)) score += 70;
  if (major === normalizedQuery) score += 90;
  if (major.startsWith(normalizedQuery)) score += 65;
  if (college.indexOf(normalizedQuery) !== -1) score += 45;
  if (major.indexOf(normalizedQuery) !== -1) score += 45;
  return score;
}

function appendRawLog_(ss, action, data) {
  const sheet = getSheet_(ss, "RawLog", ["createdAt", "action", "json"]);
  sheet.appendRow([new Date(), action, JSON.stringify(data)]);
}

function appendCounselRequest_(ss, request) {
  const sheet = getSheet_(ss, "상담신청", ["접수시각", "studentKey", "번호", "이름", "희망일", "주제", "고민", "기대 도움", "상태"]);
  sheet.appendRow([
    new Date(),
    request.key,
    request.number,
    request.studentName,
    request.date,
    request.topic,
    request.concern,
    request.need,
    request.status
  ]);
}

function upsertApplications_(ss, payload) {
  const sheet = getSheet_(ss, "원서관리", ["저장시각", "studentKey", "번호", "이름", "순위", "대학", "학과", "전형", "마감", "면접", "서류", "최저", "상태", "성적메모", "상담메모"]);
  payload.applications.forEach((app) => {
    sheet.appendRow([
      new Date(),
      payload.studentKey,
      payload.number,
      payload.studentName,
      app.rank,
      app.college,
      app.major,
      app.admissionType,
      app.deadline,
      app.interviewDate,
      app.documents,
      app.csatMinimum,
      app.status,
      app.scoreNote,
      app.memo
    ]);
  });
}

function appendCareer_(ss, payload) {
  const student = payload.student || {};
  const career = payload.careerSnapshot || student.career || {};
  const sheet = getSheet_(ss, "진로카드", ["저장시각", "studentKey", "번호", "이름", "직업", "학과", "대학", "강점"]);
  sheet.appendRow([
    career.savedAt || new Date(),
    payload.studentKey || student.studentKey,
    student.number,
    student.name,
    career.job,
    career.major,
    career.college,
    career.strength
  ]);
}

function appendRecord_(ss, record) {
  const sheet = getSheet_(ss, "상담기록", ["작성일", "학생", "교사용 메모", "다음 조치"]);
  sheet.appendRow([record.date, record.studentLabel, record.memo, record.next]);
}

function sendTeacherMail_(email, notification) {
  if (!email || !notification) return;
  MailApp.sendEmail({
    to: email,
    subject: notification.title,
    body: notification.body
  });
}

function getSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}
