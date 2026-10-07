/* eslint-env browser */
/* global window, document */

(function(){
  "use strict";

  // ---------- Backend data ----------
  var PEOPLE = [];
  var ROOMS = [];

  var api = window.RicozApi.request;

  var TITLES = ["Sync", "1:1", "Planning", "Design crit", "Client call", "Standup", "Review", "Interview", "Retro"];

  function personById(id){ for (var i=0;i<PEOPLE.length;i++){ if (PEOPLE[i].id===id) return PEOPLE[i]; } return null; }
  function roomById(id){ for (var i=0;i<ROOMS.length;i++){ if (ROOMS[i].id===id) return ROOMS[i]; } return null; }
  function pad(n){ return n<10 ? "0"+n : ""+n; }
  function ymd(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function addDays(d,n){ var r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function startOfWeek(d){ var day=(d.getDay()+6)%7; return addDays(d,-day); }
  function minToTime(m){ return pad(Math.floor(m/60))+":"+pad(m%60); }
  function timeToMin(t){ var p=t.split(":"); return parseInt(p[0],10)*60+parseInt(p[1],10); }
  function fmtTime(t){
    var m=timeToMin(t); var h=Math.floor(m/60); var mm=m%60;
    var ap = h>=12 ? "pm" : "am"; var hh = h%12===0 ? 12 : h%12;
    return hh+(mm? ":"+pad(mm) : "")+ap;
  }
  function fmtDateLong(dateStr){
    var d=new Date(dateStr+"T00:00:00");
    return d.toLocaleDateString(undefined,{weekday:"long", month:"long", day:"numeric"});
  }
  function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

  // ---------- State ----------
  var state = { events: [], sharing: {}, delegate: null };

  async function loadEvents(){
    var now = new Date();
    var from = ymd(addDays(new Date(now.getFullYear(), now.getMonth(), 1), -45));
    var to = ymd(addDays(new Date(now.getFullYear(), now.getMonth()+1, 0), 180));
    var data = await api("/events?from=" + from + "&to=" + to);
    state.events = data.events || [];
  }

  async function loadBackendState(){
    var results = await Promise.all([api("/people"), api("/rooms"), api("/sharing")]);
    PEOPLE = results[0].people || [];
    ROOMS = results[1].rooms || [];
    state.sharing = results[2].sharing || {};
    state.delegate = results[2].delegate || null;
    await loadEvents();
  }

  // ---------- Scheduling logic ----------
  function eventsOn(dateStr){
    return state.events.filter(function(e){ return e.date===dateStr; });
  }
  function isOverlap(aStart,aEnd,bStart,bEnd){ return aStart < bEnd && bStart < aEnd; }

  function isPersonFree(personId, dateStr, startMin, endMin){
    var evs = eventsOn(dateStr);
    for (var i=0;i<evs.length;i++){
      var e = evs[i];
      if (e.attendees.indexOf(personId) === -1) continue;
      if (isOverlap(startMin, endMin, timeToMin(e.start), timeToMin(e.end))) return false;
    }
    return true;
  }

  function findFreeSlots(dateStr, durationMin, attendeeIds){
    var all = ["you"].concat(attendeeIds.filter(function(a){ return a!=="you"; }));
    var results = [];
    for (var t = 9*60; t + durationMin <= 18*60; t += 30){
      var ok = true;
      for (var i=0;i<all.length;i++){
        if (!isPersonFree(all[i], dateStr, t, t+durationMin)) { ok = false; break; }
      }
      if (ok) results.push(t);
      if (results.length >= 6) break;
    }
    return results;
  }

  function bestWeekWindow(){
    var today = new Date();
    var weekStart = startOfWeek(today);
    var best = null;
    for (var dOff=0; dOff<5; dOff++){
      var day = addDays(weekStart, dOff);
      var dkey = ymd(day);
      for (var t=9*60; t+30<=18*60; t+=30){
        var freeCount = 0;
        for (var p=0;p<PEOPLE.length;p++){
          if (isPersonFree(PEOPLE[p].id, dkey, t, t+30)) freeCount++;
        }
        if (!best || freeCount > best.freeCount){
          best = { date: dkey, start: t, freeCount: freeCount };
        }
      }
    }
    return best;
  }

  function isRoomFree(roomId, dateStr, startMin, endMin){
    var evs = eventsOn(dateStr);
    for (var i=0;i<evs.length;i++){
      var e = evs[i];
      if (e.room !== roomId) continue;
      if (isOverlap(startMin, endMin, timeToMin(e.start), timeToMin(e.end))) return false;
    }
    return true;
  }

  // ---------- UI shell ----------
  var VIEWS = [
    { id: "calendar", label: "Calendar" },
    { id: "scheduler", label: "Scheduling assistant" },
    { id: "rooms", label: "Room booking" },
    { id: "sharing", label: "Sharing & delegation" }
  ];
  var ui = {
    view: "calendar",
    monthCursor: new Date(),
    selectedDate: ymd(new Date()),
    calMode: "mine" // mine | team
  };

  function toast(msg){
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function(){ el.classList.remove("show"); }, 2200);
  }

  function renderNav(){
    var nav = document.getElementById("nav");
    nav.innerHTML = "";
    VIEWS.forEach(function(v){
      var btn = document.createElement("button");
      btn.className = "nav-item" + (ui.view===v.id ? " active" : "");
      btn.innerHTML = '<span class="swatch"></span>' + v.label;
      btn.addEventListener("click", function(){ ui.view = v.id; render(); });
      nav.appendChild(btn);
    });
  }

  function topbar(title, sub){
    return '<div class="topbar">' +
      '<div><h1 class="view-title">'+title+'</h1><div class="view-sub">'+sub+'</div></div>' +
      '<div class="who">Signed in as <b>You</b> &middot; Product Design</div>' +
      '</div>';
  }

  // ---------- Calendar view ----------
  function renderCalendarView(){
    var main = document.getElementById("main");
    var cursor = ui.monthCursor;
    var year = cursor.getFullYear(), month = cursor.getMonth();
    var firstOfMonth = new Date(year, month, 1);
    var gridStart = startOfWeek(firstOfMonth);
    var monthName = firstOfMonth.toLocaleDateString(undefined,{month:"long", year:"numeric"});
    var todayKey = ymd(new Date());

    var cells = "";
    for (var i=0;i<42;i++){
      var d = addDays(gridStart, i);
      var dkey = ymd(d);
      var inMonth = d.getMonth() === month;
      var evs = eventsOn(dkey).filter(function(e){
        return ui.calMode==="mine" ? e.attendees.indexOf("you")!==-1 : true;
      });
      var dots = "";
      var seen = {};
      evs.forEach(function(e){
        e.attendees.forEach(function(pid){
          if (seen[pid]) return; seen[pid]=true;
          var person = personById(pid);
          if (person) dots += '<span style="background:'+person.color+'"></span>';
        });
      });
      var cls = "day-cell";
      if (!inMonth) cls += " muted";
      if (dkey===todayKey) cls += " today";
      if (dkey===ui.selectedDate) cls += " selected";
      cells += '<div class="'+cls+'" data-date="'+dkey+'">' +
        '<div class="day-num">'+d.getDate()+'</div>' +
        '<div class="day-dots">'+dots+'</div>' +
        '</div>';
    }

    var weekday = "";
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(function(w){ weekday += "<div>"+w+"</div>"; });

    var agendaEvs = eventsOn(ui.selectedDate).filter(function(e){
      return ui.calMode==="mine" ? e.attendees.indexOf("you")!==-1 : true;
    }).sort(function(a,b){ return timeToMin(a.start)-timeToMin(b.start); });

    var agendaHtml = "";
    if (agendaEvs.length===0){
      agendaHtml = '<div class="empty-note">Nothing on the calendar for this day. Use the scheduling assistant to add something.</div>';
    } else {
      agendaEvs.forEach(function(e){
        var names = e.attendees.map(function(id){ var p=personById(id); return p ? p.name : id; }).join(", ");
        var roomTag = e.room ? '<span class="tag room">'+roomById(e.room).name+'</span>' : "";
        agendaHtml += '<div class="agenda-item"><div><div>'+e.title+' '+roomTag+'</div>' +
          '<div class="view-sub">'+names+'</div></div>' +
          '<div class="t">'+fmtTime(e.start)+' &ndash; '+fmtTime(e.end)+'</div></div>';
      });
    }

    main.innerHTML = topbar("Calendar", "Your schedule and your team's, side by side.") +
      '<div class="toggle-row">' +
        '<button class="toggle-btn'+(ui.calMode==="mine"?" active":"")+'" id="modeMine">My calendar</button>' +
        '<button class="toggle-btn'+(ui.calMode==="team"?" active":"")+'" id="modeTeam">Team calendar</button>' +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="card">' +
          '<div class="cal-header"><div class="month">'+monthName+'</div>' +
            '<div class="cal-nav"><button class="icon-btn" id="prevMonth">&lsaquo;</button>' +
            '<button class="icon-btn" id="nextMonth">&rsaquo;</button></div></div>' +
          '<div class="weekday-row">'+weekday+'</div>' +
          '<div class="month-grid">'+cells+'</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="section-label">'+fmtDateLong(ui.selectedDate)+'</div>' +
          '<div class="agenda-list">'+agendaHtml+'</div>' +
        '</div>' +
      '</div>';

    main.querySelectorAll(".day-cell").forEach(function(cell){
      cell.addEventListener("click", function(){ ui.selectedDate = cell.getAttribute("data-date"); renderCalendarView(); });
    });
    document.getElementById("prevMonth").addEventListener("click", function(){
      ui.monthCursor = new Date(year, month-1, 1); renderCalendarView();
    });
    document.getElementById("nextMonth").addEventListener("click", function(){
      ui.monthCursor = new Date(year, month+1, 1); renderCalendarView();
    });
    document.getElementById("modeMine").addEventListener("click", function(){ ui.calMode="mine"; renderCalendarView(); });
    document.getElementById("modeTeam").addEventListener("click", function(){ ui.calMode="team"; renderCalendarView(); });
  }

  // ---------- Scheduling assistant ----------
  var schedulerForm = { title: "", date: ymd(new Date()), duration: 30, attendees: {} };

  function renderSchedulerView(){
    var main = document.getElementById("main");
    var best = bestWeekWindow();
    var bestText = best ? fmtDateLong(best.date)+" from "+fmtTime(minToTime(best.start))+" &mdash; "+best.freeCount+" of "+PEOPLE.length+" people free" : "not enough data yet";

    var checks = "";
    PEOPLE.filter(function(p){ return p.id!=="you"; }).forEach(function(p){
      var checked = schedulerForm.attendees[p.id] ? "checked" : "";
      checks += '<label class="check-row"><input type="checkbox" data-person="'+p.id+'" '+checked+'>' +
        '<span class="person-dot" style="background:'+p.color+'"></span>' + p.name + ' &middot; <span class="view-sub">'+p.role+'</span></label>';
    });

    var selectedAttendees = Object.keys(schedulerForm.attendees).filter(function(id){ return schedulerForm.attendees[id]; });
    var slots = findFreeSlots(schedulerForm.date, parseInt(schedulerForm.duration,10), selectedAttendees);
    var slotHtml = slots.length
      ? slots.map(function(m){ return '<button class="slot-chip" data-slot="'+m+'">'+fmtTime(minToTime(m))+'</button>'; }).join("")
      : '<div class="empty-note">No shared opening in working hours (9am&ndash;6pm) for this group on this day. Try a shorter duration or a different date.</div>';

    main.innerHTML = topbar("Scheduling assistant", "Find a time that actually works before you send the invite.") +
      '<div class="insight"><span class="dot"></span><div>Best open window this week: <strong>'+bestText+'</strong></div></div>' +
      '<div class="grid-2">' +
        '<div class="card">' +
          '<div class="section-label">Meeting details</div>' +
          '<label class="field"><span>Title</span><input type="text" id="mTitle" placeholder="e.g. Roadmap check-in" value="'+schedulerForm.title.replace(/"/g,"&quot;")+'"></label>' +
          '<label class="field"><span>Date</span><input type="date" id="mDate" value="'+schedulerForm.date+'"></label>' +
          '<label class="field"><span>Duration</span><select id="mDuration">' +
            [30,60,90].map(function(d){ return '<option value="'+d+'"'+(d==schedulerForm.duration?" selected":"")+'>'+d+' minutes</option>'; }).join("") +
          '</select></label>' +
          '<div class="field"><span>Attendees</span><div class="checks">'+checks+'</div></div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="section-label">Available times</div>' +
          '<div class="view-sub">Checked against everyone selected, including you.</div>' +
          '<div class="slot-list">'+slotHtml+'</div>' +
        '</div>' +
      '</div>';

    document.getElementById("mTitle").addEventListener("input", function(e){ schedulerForm.title = e.target.value; });
    document.getElementById("mDate").addEventListener("change", function(e){ schedulerForm.date = e.target.value; renderSchedulerView(); });
    document.getElementById("mDuration").addEventListener("change", function(e){ schedulerForm.duration = e.target.value; renderSchedulerView(); });
    main.querySelectorAll("[data-person]").forEach(function(cb){
      cb.addEventListener("change", function(){
        schedulerForm.attendees[cb.getAttribute("data-person")] = cb.checked;
        renderSchedulerView();
      });
    });
    main.querySelectorAll("[data-slot]").forEach(function(chip){
      chip.addEventListener("click", function(){
        var startMin = parseInt(chip.getAttribute("data-slot"),10);
        var dur = parseInt(schedulerForm.duration,10);
        var attendees = ["you"].concat(Object.keys(schedulerForm.attendees).filter(function(id){ return schedulerForm.attendees[id]; }));
        api("/events", { method: "POST", body: {
          title: schedulerForm.title || "Untitled meeting",
          date: schedulerForm.date,
          start: minToTime(startMin),
          duration: dur,
          attendees: attendees,
          room: null
        }}).then(function(){
          return loadEvents();
        }).then(function(){
          toast("Meeting scheduled for "+fmtTime(minToTime(startMin)));
          schedulerForm.title = "";
          renderSchedulerView();
        }).catch(function(err){ toast(err.message); });
      });
    });
  }

  // ---------- Room booking ----------
  var roomForm = { date: ymd(new Date()), start: "10:00", duration: 30 };

  function renderRoomsView(){
    var main = document.getElementById("main");
    var startMin = timeToMin(roomForm.start);
    var endMin = startMin + parseInt(roomForm.duration,10);

    var rows = ROOMS.map(function(r){
      var free = isRoomFree(r.id, roomForm.date, startMin, endMin);
      return '<div class="room-row">' +
        '<div><div class="room-name">'+r.name+'</div>' +
        '<div class="room-meta">'+r.floor+' &middot; seats '+r.capacity+' &middot; '+r.equipment+'</div></div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<span class="status-pill '+(free?"free":"busy")+'">'+(free?"Free":"Booked")+'</span>' +
        '<button class="btn-primary" data-room="'+r.id+'" '+(free?"":"disabled")+'>Book</button>' +
        '</div></div>';
    }).join("");

    main.innerHTML = topbar("Room booking", "Check real-time availability before you reserve a space.") +
      '<div class="grid-2">' +
        '<div class="card">' +
          '<div class="section-label">When</div>' +
          '<label class="field"><span>Date</span><input type="date" id="rDate" value="'+roomForm.date+'"></label>' +
          '<label class="field"><span>Start time</span><input type="time" id="rStart" value="'+roomForm.start+'"></label>' +
          '<label class="field"><span>Duration</span><select id="rDuration">' +
            [30,60,90,120].map(function(d){ return '<option value="'+d+'"'+(d==roomForm.duration?" selected":"")+'>'+d+' minutes</option>'; }).join("") +
          '</select></label>' +
        '</div>' +
        '<div class="card">' +
          '<div class="section-label">Rooms</div>' +
          '<div class="room-list">'+rows+'</div>' +
        '</div>' +
      '</div>';

    document.getElementById("rDate").addEventListener("change", function(e){ roomForm.date=e.target.value; renderRoomsView(); });
    document.getElementById("rStart").addEventListener("change", function(e){ roomForm.start=e.target.value; renderRoomsView(); });
    document.getElementById("rDuration").addEventListener("change", function(e){ roomForm.duration=e.target.value; renderRoomsView(); });
    main.querySelectorAll("[data-room]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var roomId = btn.getAttribute("data-room");
        api("/rooms/" + encodeURIComponent(roomId) + "/book", { method: "POST", body: {
          title: "Room booking",
          date: roomForm.date,
          start: roomForm.start,
          duration: parseInt(roomForm.duration, 10)
        }}).then(function(){
          return loadEvents();
        }).then(function(){
          toast(roomById(roomId).name+" booked for "+fmtTime(roomForm.start));
          renderRoomsView();
        }).catch(function(err){ toast(err.message); });
      });
    });
  }

  // ---------- Sharing & delegation ----------
  var PERM_LABELS = { none: "No access", view: "View only", edit: "Can edit", delegate: "Full delegate" };

  function renderSharingView(){
    var main = document.getElementById("main");
    var delegateName = state.delegate ? personById(state.delegate).name : "no one";

    var rows = PEOPLE.filter(function(p){ return p.id!=="you"; }).map(function(p){
      var perm = state.sharing[p.id] || "none";
      var opts = Object.keys(PERM_LABELS).map(function(k){
        return '<option value="'+k+'"'+(k===perm?" selected":"")+'>'+PERM_LABELS[k]+'</option>';
      }).join("");
      return '<tr><td><div class="person-cell"><span class="person-dot" style="background:'+p.color+'"></span>'+p.name+'</div></td>' +
        '<td class="view-sub">'+p.role+'</td>' +
        '<td><select data-share="'+p.id+'">'+opts+'</select></td></tr>';
    }).join("");

    main.innerHTML = topbar("Sharing & delegation", "Control who can see your calendar and who can act on your behalf.") +
      '<div class="insight"><span class="dot"></span><div><strong>'+delegateName+'</strong> can manage your calendar on your behalf.</div></div>' +
      '<div class="card">' +
        '<table class="share-table"><thead><tr><th>Person</th><th>Team</th><th>Access</th></tr></thead>' +
        '<tbody>'+rows+'</tbody></table>' +
      '</div>';

    main.querySelectorAll("[data-share]").forEach(function(sel){
      sel.addEventListener("change", function(){
        var pid = sel.getAttribute("data-share");
        var val = sel.value;
        api("/sharing/" + encodeURIComponent(pid), { method: "PUT", body: { permission: val }})
          .then(function(result){
            state.sharing = result.sharing || state.sharing;
            state.delegate = result.delegate || null;
            toast(personById(pid).name+"'s access set to "+PERM_LABELS[val]);
            renderSharingView();
          }).catch(function(err){ toast(err.message); });
      });
    });
  }

  // ---------- Router ----------
  function render(){
    renderNav();
    if (ui.view === "calendar") renderCalendarView();
    else if (ui.view === "scheduler") renderSchedulerView();
    else if (ui.view === "rooms") renderRoomsView();
    else renderSharingView();
  }

  async function bootstrap(){
    try {
      await loadBackendState();
      render();
    } catch (err) {
      console.error(err);
      var main = document.getElementById("main");
      if (main) main.innerHTML = '<div class="card" style="margin:40px"><h2>Unable to connect to the RicozCalendar API</h2><p class="view-sub">'+String(err.message || err)+'</p><p class="view-sub">Check that the backend is running and the API URL in js/config.js is correct.</p></div>';
    }
  }

  bootstrap();
})();

