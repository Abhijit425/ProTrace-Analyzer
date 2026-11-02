"""
Generates samples/qad-client-test.log: a realistic OpenEdge client log (LOG-MANAGER format)
for testing ProTrace Analyzer. Deterministic (fixed seed), so the output is always the same.

Scenarios (each is a separate client session / PID, interleaved by time):
  P-004812  PO maintenance (popomt.p)  -> error 91 deep in a call stack, followed by 142
  P-005120  SO maintenance (sosomt.p)  -> record lock wait (2624), later lock table overflow (915)
  P-006044  Batch inventory transfer   -> many fast Run/Return pairs, one slow procedure, -nb warning (5407)
  P-007233  Report run                  -> program not found (293), invalid handle (3135), then a crash (49) with stack dump
  P-004812  ...continues with duplicate key (132) and record not on file (138)

Run:  python samples/generate-test-log.py
"""
import random
from datetime import datetime, timedelta

random.seed(42)
OUT = "samples/qad-client-test.log"
lines = []  # (datetime, text)


def stamp(t: datetime) -> str:
    return t.strftime("%y/%m/%d@%H:%M:%S.") + f"{t.microsecond // 1000:03d}+0530"


class Session:
    def __init__(self, pid, tid, start):
        self.pid, self.tid, self.t = pid, tid, start
        self.stack = []  # (procName, file)

    def tick(self, ms_min=1, ms_max=15):
        self.t += timedelta(milliseconds=random.randint(ms_min, ms_max))

    def log(self, level, etype, msg, ms=(1, 15)):
        self.tick(*ms)
        lines.append((self.t, f"[{stamp(self.t)}] P-{self.pid:06d} T-{self.tid:06d} {level} 4GL {etype:<14} {msg}"))

    def where(self, line):
        proc, f = self.stack[-1] if self.stack else ("Main Block", "mfmenu.p")
        return f"[{proc} - {f} @ {line}]"

    def run(self, target, args="", line=None, internal=False, ms=(1, 15)):
        line = line or random.randint(20, 900)
        a = f" {args}" if args else ""
        self.log(4, "4GLTRACE", f"Run {target}{a} {self.where(line)}", ms)
        if internal:
            self.stack.append((target, self.stack[-1][1] if self.stack else "mfmenu.p"))
        else:
            self.log(3, "FILEID", f"Open D:\\qad\\erp\\us\\{target[:2]}\\{target.replace('.p', '.r')} ID={random.randint(10, 400)}")
            self.stack.append(("Main Block", target))

    def func(self, name, args, line=None):
        line = line or random.randint(20, 900)
        self.log(4, "4GLTRACE", f'Func {name} {args} {self.where(line)}')
        self.log(4, "4GLTRACE", f"Return from {name} [{self.stack[-1][1]}]", (0, 3))

    def ret(self, ms=(1, 15)):
        proc, f = self.stack.pop()
        self.log(4, "4GLTRACE", f"Return from {proc} [{f}]", ms)

    def error(self, msg, line):
        proc, f = self.stack[-1]
        where = f"{proc} {f}" if proc != "Main Block" else f
        self.log(1, "4GLMESSAGE", f"(Procedure: '{where}' Line:{line}) {msg}", (1, 4))


T0 = datetime(2026, 10, 12, 10, 15, 0)

# ---------------- header for every session ----------------
sessions = {
    "po": Session(4812, 1, T0),
    "so": Session(5120, 1, T0 + timedelta(seconds=3)),
    "batch": Session(6044, 2, T0 + timedelta(seconds=7)),
    "rpt": Session(7233, 1, T0 + timedelta(seconds=40)),
}
for s in sessions.values():
    s.log(1, "--", "Logging level set to = 4")
    s.log(1, "--", "Log entry types activated: 4GLTrace:4,4GLMessages,DB.Connects,FileID,QryInfo")
    for db, n in (("qaddb", 15321), ("qadadm", 15321), ("hlpdb", 15321)):
        s.log(2, "DB.CONNECTS", f"Connected to database {db}, single user = no ({n})", (5, 40))
    s.run("mfmenu.p", line=1)

# ---------------- P-004812: PO maintenance -> 91 -> 142 ----------------
po = sessions["po"]
po.run("popomt.p", line=812)
po.run("gpglef.p", '"PO" "10"', line=144)
po.ret()
po.run("popomta.p", line=388)
po.run("get-vendor", '"V1000"', line=97, internal=True)
po.log(4, "QRYINFO", "Query Plan: popomta.p line 103 FOR EACH vd_mstr WHERE vd_domain = global_domain AND vd_addr = ... INDEX vd_addr")
po.ret()
for i in range(6):  # line entry loop
    po.run("popomtb.p", f'"{1001}" "{i + 1}"', line=455)
    po.run("validate-part", f'"10-{1000 + i * 10}"', line=201, internal=True)
    po.func("getPartDesc", f'"10-{1000 + i * 10}"', line=208)
    po.log(4, "QRYINFO", "Query Plan: popomtb.p line 214 FIND pt_mstr WHERE pt_domain = global_domain AND pt_part = ... INDEX pt_part")
    if i == 4:
        po.error("** No pt_mstr record is available. (91)", 214)
        po.error("** Unable to update pod_det Field. (142)", 236)
    po.ret()
    po.ret()
po.ret()
po.run("popomtc.p", line=402)
po.run("calc-totals", line=77, internal=True)
po.ret(ms=(400, 600))  # slow
po.ret()
po.ret()

# ---------------- P-005120: SO maintenance -> 2624 lock waits -> 915 ----------------
so = sessions["so"]
so.run("sosomt.p", line=812)
so.run("sosomta.p", line=310)
so.run("lock-so-header", '"SO-20877"', line=150, internal=True)
for _ in range(3):
    so.error("** so_mstr is in use by mfg on batch. Wait or choose CANCEL to stop. (2624)", 162)
    so.tick(2000, 3000)
so.ret()
so.run("sosomtb.p", line=520)
for i in range(4):
    so.run("allocate-line", f'"SO-20877" "{i + 1}"', line=600, internal=True)
    so.log(4, "QRYINFO", "Query Plan: sosomtb.p line 640 FOR EACH ld_det EXCLUSIVE-LOCK WHERE ld_domain = global_domain AND ld_part = ... INDEX ld_part_loc")
    so.ret(ms=(50, 120))
so.log(1, "--", "** Lock table overflow, increase -L on server (915)", (1, 3))
so.error("** Unable to update ld_det Field. (142)", 655)
so.ret()
so.ret()
so.ret()

# ---------------- P-006044: batch, lots of trace + slow proc + 5407 ----------------
b = sessions["batch"]
b.run("iclotr.p", '"BATCH"', line=812)
for i in range(180):
    b.run("ictrancr.p", f'"{i + 1}"', line=1204, ms=(1, 4))
    b.run("update-inventory", line=88, internal=True, ms=(1, 3))
    b.func("getSite", '"10"', line=91)
    b.ret(ms=(2, 9))
    if i % 37 == 0:
        b.log(4, "QRYINFO", "Query Plan: ictrancr.p line 140 FOR EACH tr_hist WHERE tr_domain = global_domain AND tr_effdate >= ... WHOLE-INDEX")
    b.ret(ms=(1, 4))
    if i == 90:
        b.log(2, "--", "WARNING: -nb exceeded. Automatically increasing from 160 to 192. (5407)", (1, 3))
b.run("icrecalc.p", line=1500)
b.ret(ms=(4200, 4800))  # very slow procedure
b.log(2, "--", "Procedure complete.")
b.ret()

# ---------------- P-007233: report -> 293, 3135, crash 49 ----------------
r = sessions["rpt"]
r.run("rcrprp.p", line=812)
r.run("xxrptlib.p", line=55)
r.log(1, "4GLMESSAGE", "** \"xxrptfmt.p\" was not found. (293)", (1, 3))
r.ret()
r.run("build-output", line=120, internal=True)
r.log(4, "4GLTRACE", f'Publish "ReportReady" {r.where(131)}')
r.log(4, "4GLTRACE", f"Subscribe ReportReady [Main Block - xxlisten.p @ 12]")
r.error("** Invalid widget-id. Not initialized or already deleted. (3135)", 140)
r.ret()
r.log(1, "--", "SYSTEM ERROR: Memory violation. (49)", (1, 3))
crash_t = r.t
for extra in ["** ABL stack trace:", "    build-output rcrprp.p line 140", "    Main Block rcrprp.p line 1", "    Main Block mfmenu.p line 812",
              "** Writing protrace.7233 (439)"]:
    lines.append((crash_t, extra))

# ---------------- P-004812 continues: 132 + 138 ----------------
po.tick(5000, 8000)
po.run("ppptmt.p", line=812)
po.run("create-item", '"10-1040"', line=310, internal=True)
po.error('** pt_mstr already exists with Item Number "10-1040". (132)', 322)
po.ret()
po.run("delete-item", '"10-9999"', line=410, internal=True)
po.error("** pt_mstr record not on file. (138)", 418)
po.ret()
po.ret()
po.ret()  # mfmenu.p

for s in sessions.values():
    while s.stack:
        s.ret()

# Sort by time (stable, so continuation lines stay after their entry), then write.
lines.sort(key=lambda x: x[0])
with open(OUT, "w", newline="\r\n") as f:
    for _, text in lines:
        f.write(text + "\n")
print(f"wrote {OUT}: {len(lines)} lines, {lines[0][0]:%H:%M:%S} - {lines[-1][0]:%H:%M:%S}")
