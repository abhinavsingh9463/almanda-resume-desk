import React, { useState, useRef } from "react";
import mammoth from "mammoth";

const FONT_SERIF = "'Source Serif Pro', Georgia, 'Times New Roman', serif";
const FONT_MONO = "'IBM Plex Mono', 'Courier New', monospace";

const COLORS = {
  paper: "#EFEAE0",
  paperDark: "#E4DDCD",
  ink: "#232620",
  inkSoft: "#5B5A50",
  manila: "#C9A876",
  manilaDark: "#A9885C",
  stamp: "#B5472F",
  approve: "#4C7A5D",
  line: "#D8D0BE",
};

const CATEGORY_META = [
  { key: "job_match", label: "JOB MATCH", max: 40 },
  { key: "skills_keywords", label: "SKILLS & KEYWORDS", max: 20 },
  { key: "language_clarity", label: "LANGUAGE & CLARITY", max: 15 },
  { key: "formatting", label: "FORMAT & STRUCTURE", max: 15 },
  { key: "impact", label: "ACHIEVEMENTS & IMPACT", max: 10 },
];

function Stamp({ score }) {
  const verdict = score >= 80 ? "STRONG MATCH" : score >= 55 ? "WORTH A SHOT" : "NEEDS WORK";
  const color = score >= 80 ? COLORS.approve : score >= 55 ? COLORS.manilaDark : COLORS.stamp;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 176, height: 176, borderRadius: "50%", border: `4px solid ${color}`, color, transform: "rotate(-6deg)", fontFamily: FONT_MONO, flexShrink: 0 }}>
      <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 12, letterSpacing: "0.1em", marginTop: 8, textAlign: "center", padding: "0 14px" }}>{verdict}</div>
    </div>
  );
}

function CategoryBar({ label, score, max, note }) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  const color = pct >= 75 ? COLORS.approve : pct >= 45 ? COLORS.manilaDark : COLORS.stamp;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.ink }}>{label}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.inkSoft }}>{score}/{max}</span>
      </div>
      <div style={{ height: 8, background: COLORS.line, width: "100%", borderRadius: 2 }}>
        <div style={{ height: 8, width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      {note && <div style={{ fontFamily: FONT_SERIF, fontSize: 15.5, color: COLORS.inkSoft, marginTop: 7, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

function Section({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  const color = tone === "good" ? COLORS.approve : tone === "bad" ? COLORS.stamp : COLORS.ink;
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: "0.1em", color, marginBottom: 11 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i} style={{ fontFamily: FONT_SERIF, fontSize: 16.5, lineHeight: 1.65, color: COLORS.ink, marginBottom: 7 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DocCard({ label, value, onChange, placeholder, onFile, fileName, fileError, importing }) {
  const inputRef = useRef(null);
  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, boxShadow: "4px 5px 0 rgba(35,38,32,0.08)", padding: "26px 26px 20px", display: "flex", flexDirection: "column", flex: 1, minWidth: 300 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px dashed ${COLORS.line}`, paddingBottom: 12, marginBottom: 16 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: "0.1em", color: COLORS.inkSoft }}>{label}</span>
        <button onClick={() => inputRef.current && inputRef.current.click()} disabled={importing} style={{ fontFamily: FONT_MONO, fontSize: 12.5, background: importing ? COLORS.line : COLORS.manila, color: COLORS.ink, border: "none", padding: "9px 15px", cursor: importing ? "default" : "pointer", borderRadius: 2 }}>
          {importing ? "IMPORTING..." : "IMPORT FILE"}
        </button>
        <input ref={inputRef} type="file" accept=".txt,.docx,.pdf" style={{ display: "none" }} onChange={(e) => { const file = e.target.files && e.target.files[0]; if (file) onFile(file); e.target.value = ""; }} />
      </div>
      {fileName && !fileError && <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: COLORS.approve, marginBottom: 10 }}>loaded: {fileName}</div>}
      {fileError && <div style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: COLORS.stamp, marginBottom: 10 }}>{fileError}</div>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ resize: "vertical", minHeight: 260, border: "none", outline: "none", fontFamily: FONT_SERIF, fontSize: 16.5, lineHeight: 1.6, color: COLORS.ink, background: "transparent" }} />
      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: COLORS.inkSoft, marginTop: 10 }}>.txt, .docx, or .pdf — or paste directly above</div>
    </div>
  );
}

export default function Home() {
  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [resumeFileError, setResumeFileError] = useState("");
  const [resumeImporting, setResumeImporting] = useState(false);
  const [jobFileName, setJobFileName] = useState("");
  const [jobFileError, setJobFileError] = useState("");
  const [jobImporting, setJobImporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  const [playerName, setPlayerName] = useState("");
  const [challengeCode, setChallengeCode] = useState("");
  const [challengeInput, setChallengeInput] = useState("");
  const [challengeError, setChallengeError] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);
  const [posted, setPosted] = useState(false);

  async function extractText(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "txt") return await file.text();
    if (ext === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const res = await mammoth.extractRawText({ arrayBuffer });
      return res.value;
    }
    if (ext === "pdf") {
      const base64Data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(",")[1]);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "extract failed");
      return data.text;
    }
    throw new Error("unsupported");
  }

  async function handleResumeFile(file) {
    setResumeFileError("");
    setResumeImporting(true);
    try {
      const text = await extractText(file);
      setResume(text);
      setResumeFileName(file.name);
    } catch {
      setResumeFileError("Couldn't read that file — try .txt/.docx/.pdf or paste instead.");
    } finally {
      setResumeImporting(false);
    }
  }

  async function handleJobFile(file) {
    setJobFileError("");
    setJobImporting(true);
    try {
      const text = await extractText(file);
      setJob(text);
      setJobFileName(file.name);
    } catch {
      setJobFileError("Couldn't read that file — try .txt/.docx/.pdf or paste instead.");
    } finally {
      setJobImporting(false);
    }
  }

  async function startChallenge() {
    setChallengeError("");
    if (!job.trim()) return setChallengeError("Add a job description first, then start a challenge.");
    try {
      const res = await fetch("/api/challenge?action=start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChallengeCode(data.code);
      setLeaderboard([]);
      setPosted(false);
    } catch {
      setChallengeError("Couldn't start a challenge right now — try again.");
    }
  }

  async function joinChallenge() {
    setChallengeError("");
    const code = challengeInput.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await fetch(`/api/challenge?action=join&code=${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJob(data.job);
      setChallengeCode(code);
      setLeaderboard(data.entries || []);
      setPosted(false);
    } catch {
      setChallengeError("No challenge found with that code.");
    }
  }

  async function refreshLeaderboard(code) {
    try {
      const res = await fetch(`/api/challenge?action=leaderboard&code=${code}`);
      const data = await res.json();
      if (res.ok) setLeaderboard(data.entries || []);
    } catch {
      // ignore, keep last known leaderboard
    }
  }

  async function postScore() {
    if (!challengeCode || !result) return;
    try {
      const res = await fetch("/api/challenge?action=post-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: challengeCode, name: playerName.trim() || "Anonymous", score: result.total }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLeaderboard(data.entries || []);
      setPosted(true);
    } catch {
      setChallengeError("Couldn't post your score right now — try again.");
    }
  }

  async function submitFeedback(helpful) {
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful, score: result ? result.total : null }),
      });
    } catch {
      // best-effort
    } finally {
      setFeedbackGiven(true);
    }
  }

  async function handleScore() {
    setError("");
    setResult(null);
    setFeedbackGiven(false);
    if (!resume.trim() || !job.trim()) return setError("Add both your resume and the job description first.");
    setLoading(true);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "score failed");
      setResult(data);
    } catch (e) {
      setError(e.message || "Couldn't score that just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell" style={{ minHeight: "100vh", background: COLORS.paper, padding: "72px 32px 96px", fontFamily: FONT_SERIF }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 14, letterSpacing: "0.18em", color: COLORS.manila, background: COLORS.ink, padding: "6px 12px" }}>ALMANDA</div>
          <div style={{ fontSize: 15, color: COLORS.inkSoft, fontFamily: FONT_MONO }}>resume desk · candidate review</div>
        </div>

        <h1 className="hero-title" style={{ fontWeight: 600, color: COLORS.ink, margin: "0 0 20px", lineHeight: 1.08, maxWidth: 780 }}>
          See your resume the way a recruiter does.
        </h1>
        <p style={{ fontSize: 19, color: COLORS.inkSoft, marginBottom: 22, maxWidth: 640, lineHeight: 1.6 }}>
          Import your resume and the job you&apos;re eyeing. Get a category-by-category score out of 100, your weak points, and exactly what to fix before you apply.
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 48 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.ink, border: `1px solid ${COLORS.manilaDark}`, padding: "8px 14px" }}>✓ built for the Indian job market</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.ink, border: `1px solid ${COLORS.manilaDark}`, padding: "8px 14px" }}>✓ free score, always</div>
        </div>

        <div style={{ background: COLORS.paperDark, border: `1px dashed ${COLORS.manilaDark}`, padding: "26px 30px", marginBottom: 40 }}>
          <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: "0.1em", color: COLORS.ink, marginBottom: 16 }}>COMPETE WITH FRIENDS & FAMILY</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Your name (shown on the leaderboard)" style={{ fontFamily: FONT_SERIF, fontSize: 15.5, padding: "11px 14px", border: `1px solid ${COLORS.line}`, flex: "1 1 240px", minWidth: 200 }} />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={startChallenge} style={{ fontFamily: FONT_MONO, fontSize: 13, background: COLORS.ink, color: COLORS.paper, border: "none", padding: "12px 18px", cursor: "pointer" }}>START A CHALLENGE</button>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.inkSoft }}>or</span>
            <input value={challengeInput} onChange={(e) => setChallengeInput(e.target.value)} placeholder="Enter a code" style={{ fontFamily: FONT_MONO, fontSize: 14.5, padding: "11px 14px", border: `1px solid ${COLORS.line}`, width: 140, textTransform: "uppercase" }} />
            <button onClick={joinChallenge} style={{ fontFamily: FONT_MONO, fontSize: 13, background: COLORS.manila, color: COLORS.ink, border: "none", padding: "12px 18px", cursor: "pointer" }}>JOIN</button>
          </div>
          {challengeError && <div style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: COLORS.stamp, marginTop: 14 }}>{challengeError}</div>}
          {challengeCode && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.ink, marginBottom: 12 }}>
                Challenge code: <strong>{challengeCode}</strong> — share this with friends & family
              </div>
              <button onClick={() => refreshLeaderboard(challengeCode)} style={{ fontFamily: FONT_MONO, fontSize: 12, background: "transparent", color: COLORS.inkSoft, border: `1px solid ${COLORS.line}`, padding: "8px 12px", cursor: "pointer", marginBottom: 14 }}>REFRESH LEADERBOARD</button>
              {leaderboard.length > 0 ? (
                <ol style={{ margin: 0, paddingLeft: 22 }}>
                  {leaderboard.map((entry, i) => (
                    <li key={i} style={{ fontFamily: FONT_SERIF, fontSize: 16, color: COLORS.ink, marginBottom: 5 }}>{entry.name} — {entry.score}/100</li>
                  ))}
                </ol>
              ) : (
                <div style={{ fontFamily: FONT_SERIF, fontSize: 15, color: COLORS.inkSoft }}>No scores posted yet — be the first.</div>
              )}
              <div style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: COLORS.inkSoft, marginTop: 12 }}>Names and scores posted here are visible to anyone with this code.</div>
            </div>
          )}
        </div>

        <div className="doc-cards" style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 28 }}>
          <DocCard label="YOUR RESUME" value={resume} onChange={setResume} placeholder="Import a file, or paste your resume text here..." onFile={handleResumeFile} fileName={resumeFileName} fileError={resumeFileError} importing={resumeImporting} />
          <DocCard label="THE JOB" value={job} onChange={setJob} placeholder="Import a file, or paste the job description here..." onFile={handleJobFile} fileName={jobFileName} fileError={jobFileError} importing={jobImporting} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 44 }}>
          <button onClick={handleScore} disabled={loading} style={{ fontFamily: FONT_MONO, fontSize: 15, background: loading ? COLORS.inkSoft : COLORS.ink, color: COLORS.paper, border: "none", padding: "17px 30px", cursor: loading ? "default" : "pointer" }}>
            {loading ? "REVIEWING..." : "SCORE MY RESUME"}
          </button>
          {error && <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: COLORS.stamp }}>{error}</div>}
        </div>

        {result && (
          <div style={{ background: "#fff", border: `1px solid ${COLORS.line}`, boxShadow: "4px 5px 0 rgba(35,38,32,0.08)", padding: 40, display: "flex", gap: 44, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              <Stamp score={result.total} />
              {challengeCode && (
                <button onClick={postScore} disabled={posted} style={{ fontFamily: FONT_MONO, fontSize: 12, background: posted ? COLORS.line : COLORS.approve, color: posted ? COLORS.inkSoft : "#fff", border: "none", padding: "10px 14px", cursor: posted ? "default" : "pointer" }}>
                  {posted ? "POSTED TO LEADERBOARD" : "POST TO LEADERBOARD"}
                </button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: "0.1em", color: COLORS.ink, marginBottom: 16 }}>SCORE BREAKDOWN</div>
              {CATEGORY_META.map((c) => {
                const cat = result.categories[c.key] || { score: 0, note: "" };
                return <CategoryBar key={c.key} label={c.label} score={cat.score} max={c.max} note={cat.note} />;
              })}
            </div>
            <div style={{ flex: 1, minWidth: 280 }}>
              <Section title="WHAT'S WORKING" items={result.strengths} tone="good" />
              <Section title="WEAK POINTS" items={result.weak_points} tone="bad" />
              <Section title="FIX BEFORE YOU APPLY" items={result.suggestions} tone="neutral" />
            </div>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14 }}>
            {feedbackGiven ? (
              <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.approve }}>Thanks — that helps us improve this.</div>
            ) : (
              <>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: COLORS.inkSoft }}>Was this review useful?</span>
                <button onClick={() => submitFeedback(true)} style={{ fontFamily: FONT_MONO, fontSize: 13, background: "transparent", border: `1px solid ${COLORS.line}`, padding: "6px 12px", cursor: "pointer", color: COLORS.ink }}>👍 Yes</button>
                <button onClick={() => submitFeedback(false)} style={{ fontFamily: FONT_MONO, fontSize: 13, background: "transparent", border: `1px solid ${COLORS.line}`, padding: "6px 12px", cursor: "pointer", color: COLORS.ink }}>👎 No</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
