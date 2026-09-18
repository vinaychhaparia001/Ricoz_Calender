/* eslint-env browser */
/* global window, document */

(function(){
  "use strict";

  // ---------- Mock data ----------
  var PEOPLE = [
    { id: "you",   name: "You",           role: "Product Design", color: "#1F3A5F" },
    { id: "priya", name: "Priya Nair",    role: "Engineering",    color: "#2F6B4F" },
    { id: "dev",   name: "Dev Kapoor",    role: "Engineering",    color: "#B54834" },
    { id: "amara", name: "Amara Singh",   role: "Program Mgmt",   color: "#8A6D1F" },
    { id: "noah",  name: "Noah Fischer",  role: "Design",         color: "#5B6472" }
  ];
  var ROOMS = [
    { id: "r1", name: "Falcon", capacity: 4,  equipment: "Video conf, whiteboard",        floor: "3rd floor" },
    { id: "r2", name: "Orion",  capacity: 10, equipment: "Video conf, projector",          floor: "3rd floor" },
    { id: "r3", name: "Atlas",  capacity: 2,  equipment: "Phone only",                     floor: "2nd floor" },
    { id: "r4", name: "Vega",   capacity: 20, equipment: "Video conf, projector, stage mic", floor: "Ground floor" }
  ];
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
  var STORE_KEY = "ricoz-calendar-state-v1";
  var state = null;

  function generateSeed(){
    var today = new Date();
    var weekStart = startOfWeek(today);
    var events = [];
    var idc = 1;

    for (var dOff=0; dOff<5; dOff++){
      var day = addDays(weekStart, dOff);
      var dkey = ymd(day);
      for (var p=0;p<PEOPLE.length;p++){
        var person = PEOPLE[p];
        var n = randInt(1,3);
        for (var i=0;i<n;i++){
          var startHour = randInt(9,16);
          var startMin = Math.random()<0.5 ? 0 : 30;
          var dur = [30,60,90][randInt(0,2)];
          var startTotal = startHour*60+startMin;
          var endTotal = startTotal+dur;
          if (endTotal > 18*60) continue;
          events.push({
            id: "e"+(idc++),
            title: TITLES[randInt(0,TITLES.length-1)],
            date: dkey,
            start: minToTime(startTotal),
            end: minToTime(endTotal),
            attendees: [person.id],
            room: null
          });
        }
      }
    }
    // A couple of team meetings so the calendar has real shared context
    events.push({ id:"e"+(idc++), title:"Sprint planning", date: ymd(weekStart), start:"10:00", end:"11:00", attendees:["you","priya","dev","amara"], room:"r2" });
    events.push({ id:"e"+(idc++), title:"Design review", date: ymd(addDays(weekStart,2)), start:"14:00", end:"15:00", attendees:["you","priya","noah"], room:"r1" });

    return {
      events: events,
      sharing: { priya: "edit", dev: "view", amara: "view", noah: "none" },
      delegate: "priya"
    };
  }

  function loadState(){
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw){
        var parsed = JSON.parse(raw);
        if (parsed && parsed.events) return parsed;
      }
    } catch(e){ /* storage unavailable - fall through to seed */ }
    return generateSeed();
  }
  function saveState(){
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch(e){ /* best effort only */ }
  }

  state = loadState();

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
        state.events.push({
          id: "e"+Date.now(),
          title: schedulerForm.title || "Untitled meeting",
          date: schedulerForm.date,
          start: minToTime(startMin),
          end: minToTime(startMin+dur),
          attendees: attendees,
          room: null
        });
        saveState();
        toast("Meeting scheduled for "+fmtTime(minToTime(startMin)));
        schedulerForm.title = "";
        renderSchedulerView();
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
        state.events.push({
          id: "e"+Date.now(),
          title: "Room booking",
          date: roomForm.date,
          start: roomForm.start,
          end: minToTime(timeToMin(roomForm.start)+parseInt(roomForm.duration,10)),
          attendees: ["you"],
          room: roomId
        });
        saveState();
        toast(roomById(roomId).name+" booked for "+fmtTime(roomForm.start));
        renderRoomsView();
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
        state.sharing[pid] = val;
        if (val === "delegate"){
          state.delegate = pid;
          Object.keys(state.sharing).forEach(function(other){
            if (other!==pid && state.sharing[other]==="delegate") state.sharing[other]="edit";
          });
        } else if (state.delegate === pid){
          state.delegate = null;
        }
        saveState();
        toast(personById(pid).name+"'s access set to "+PERM_LABELS[val]);
        renderSharingView();
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

  render();
})();
