(function () {
  var SHEET_URL =
    "https://docs.google.com/spreadsheets/d/17VmTRJj9qMnQ3ap7eIXpdhkQovps_8JiinE3aQwUInE/gviz/tq?tqx=out:json&gid=0&headers=0&tq=" +
    encodeURIComponent("select A,B,C,D,E");

  var COPY = {
    en: {
      loading: "Loading the class schedule…",
      error: "The class schedule could not be loaded. Please refresh the page."
    },
    zh: {
      loading: "正在加载课程表…",
      error: "课程表暂时无法加载，请刷新页面。"
    }
  };

  var LABELS = {
    "Online Classes": "线上课程",
    "In-Person Classes": "线下课程",
    "Citizenship English": "1级 - 入籍英语",
    N400: "2级 - N400申请/ 50个问题",
    "US History": "3级 - 美国历史/100题",
    "Mock Interview": "4级 - 一对一模拟公民面试",
    "Other Class": "其他课程",
    "Zoom Link": "Zoom 链接",
    Monday: "星期一",
    Tuesday: "星期二",
    Wednesday: "星期三",
    Thursday: "星期四",
    Friday: "星期五",
    Saturday: "星期六",
    Sunday: "星期天"
  };

  function cellText(row, index) {
    if (!row || !row.c || !row.c[index]) return "";
    var cell = row.c[index];
    var value = cell.f != null ? cell.f : cell.v;
    if (value == null) return "";
    return String(value).replace(/\u00a0/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch];
    });
  }

  function renderText(value, lang) {
    var text = translate(value, lang);
    var parts = String(text).split(/(https?:\/\/[^\s]+)/g);
    return parts
      .map(function (part, index) {
        if (index % 2 === 1) {
          var href = part.replace(/[),.;]+$/, "");
          var trail = part.slice(href.length);
          return (
            '<a href="' +
            escapeHtml(href) +
            '">' +
            escapeHtml(href) +
            "</a>" +
            escapeHtml(trail)
          );
        }
        return escapeHtml(part).replace(/\n/g, "<br>");
      })
      .join("");
  }

  function translate(value, lang) {
    if (lang !== "zh" || !value) return value;
    return String(value).replace(
      /Online Classes|In-Person Classes|Citizenship English|Mock Interview|US History|Other Class|Zoom Link|N400|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/g,
      function (label) {
        return LABELS[label] || label;
      }
    );
  }

  function isZoomLabel(value) {
    return /^zoom\s*link$/i.test(value);
  }

  function isTimeSlot(value) {
    return /\d/.test(value) && /am|pm|:/i.test(value);
  }

  function parseSchedule(table) {
    var rows = (table && table.rows) || [];
    var headerByCol = {};
    var classCols = [];
    var sections = [];
    var currentSection = null;
    var currentBlock = null;

    function ensureSection(title) {
      currentSection = { title: title || "", blocks: [] };
      sections.push(currentSection);
      currentBlock = null;
    }

    rows.forEach(function (row) {
      var label = cellText(row, 0);
      var values = [];
      for (var i = 1; i < 5; i++) values.push(cellText(row, i));

      if (label && !isZoomLabel(label) && !isTimeSlot(label) && values.every(function (value) { return !value; })) {
        ensureSection(label);
        return;
      }

      if (isTimeSlot(label)) {
        if (!currentSection) ensureSection("");
        values.forEach(function (value, index) {
          if (value && !headerByCol[index]) headerByCol[index] = value;
        });
        currentBlock = { time: label, names: [[], [], [], []], zoom: ["", "", "", ""] };
        currentSection.blocks.push(currentBlock);
        values.forEach(function (value, index) {
          if (value && value !== headerByCol[index]) currentBlock.names[index].push(value);
        });
        return;
      }

      if (!currentBlock) return;

      if (isZoomLabel(label)) {
        values.forEach(function (value, index) {
          if (value) currentBlock.zoom[index] = value;
        });
        return;
      }

      values.forEach(function (value, index) {
        if (value) currentBlock.names[index].push(value);
      });
    });

    for (var col = 0; col < 4; col++) {
      var used = sections.some(function (section) {
        return section.blocks.some(function (block) {
          return headerByCol[col] || block.names[col].length || block.zoom[col];
        });
      });
      if (used) classCols.push(col);
    }

    return { sections: sections, headerByCol: headerByCol, classCols: classCols };
  }

  function renderSchedule(root, lang, schedule) {
    var html = "";
    schedule.sections.forEach(function (section) {
      if (!section.blocks.length) return;
      if (section.title) {
        html += '<h3 class="schedule-section">' + renderText(section.title, lang) + "</h3>";
      }
      section.blocks.forEach(function (block) {
        var hasZoom = schedule.classCols.some(function (col) { return block.zoom[col]; });
        html += '<table class="table table-bordered schedule-table">';
        html += '<thead class="table-primary"><tr>';
        html += '<th scope="col">' + renderText(block.time, lang) + "</th>";
        schedule.classCols.forEach(function (col) {
          html += '<th scope="col">' + renderText(schedule.headerByCol[col] || "", lang) + "</th>";
        });
        html += "</tr></thead><tbody><tr><td></td>";
        schedule.classCols.forEach(function (col) {
          html += "<td>" + block.names[col].map(function (name) {
            return renderText(name, lang);
          }).join("<br>") + "</td>";
        });
        html += "</tr>";
        if (hasZoom) {
          html += "<tr><th scope=\"row\">" + renderText("Zoom Link", lang) + "</th>";
          schedule.classCols.forEach(function (col) {
            html += "<td>" + (block.zoom[col] ? renderText(block.zoom[col], lang) : "") + "</td>";
          });
          html += "</tr>";
        }
        html += "</tbody></table>";
      });
    });
    root.innerHTML = html;
  }

  function loadSheet() {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      var settled = false;
      var previous = window.google && window.google.visualization && window.google.visualization.Query
        ? window.google.visualization.Query.setResponse
        : null;

      function finish(error, table) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (previous) window.google.visualization.Query.setResponse = previous;
        script.remove();
        if (error) reject(error);
        else resolve(table);
      }

      window.google = window.google || {};
      window.google.visualization = window.google.visualization || {};
      window.google.visualization.Query = window.google.visualization.Query || {};
      window.google.visualization.Query.setResponse = function (response) {
        if (previous) previous(response);
        if (!response || response.status !== "ok" || !response.table) {
          finish(new Error("schedule"));
          return;
        }
        finish(null, response.table);
      };

      var timer = setTimeout(function () { finish(new Error("timeout")); }, 15000);
      script.onerror = function () { finish(new Error("network")); };
      script.src = SHEET_URL + "&t=" + Date.now();
      document.head.appendChild(script);
    });
  }

  function init() {
    var root = document.getElementById("schedule");
    if (!root) return;
    var lang = root.getAttribute("data-lang") === "zh" ? "zh" : "en";
    var copy = COPY[lang];
    root.innerHTML = '<p class="schedule-status">' + escapeHtml(copy.loading) + "</p>";
    loadSheet()
      .then(function (table) {
        renderSchedule(root, lang, parseSchedule(table));
      })
      .catch(function () {
        root.innerHTML = '<p class="schedule-status">' + escapeHtml(copy.error) + "</p>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
