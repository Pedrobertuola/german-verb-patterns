import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { families, verbs, type Verb } from './data/verbs'

const STORAGE_KEY = 'german-verb-patterns-progress-v1'

const FORM_STEPS = [
  {
    name: 'Infinitive',
    key: 'infinitive',
    sentenceKey: 'presentSentence',
  },
  {
    name: 'Simple Past',
    key: 'praeteritum',
    sentenceKey: 'praeteritumSentence',
  },
  {
    name: 'Past Participle',
    key: 'partizip',
    sentenceKey: 'partizipSentence',
  },
] as const

type StepIndex = 0 | 1 | 2 | 3
type FormStepIndex = 0 | 1 | 2

type FamilyRecord = {
  attempts: number
  perfect: number
  mistakes: number
}

type ReviewEntry = {
  verb: Verb
  perfectCycles: number
  mistakes: number
  addedAt: number
}

type ProgressState = {
  xp: number
  streak: number
  bestStreak: number
  answerCount: number
  correctCount: number
  mastery: Record<string, number>
  reviews: Record<string, ReviewEntry>
  familyStats: Record<string, FamilyRecord>
}

type RoundState = {
  verb: Verb
  step: StepIndex
  hadMistake: boolean
  mistakes: number
  patternChoices: string[]
}

type FeedbackState = {
  tone: 'success' | 'error'
  title: string
  detail: string
}

type PendingRoundResult = {
  hadMistake: boolean
  mistakes: number
}

type FamilySummary = {
  family: string
  percent: number
  attempts: number
  perfect: number
  mistakes: number
  inReview: number
}

type InitialSession = {
  progress: ProgressState
  round: RoundState
}

const VOWEL_TOKENS = ['a', 'e', 'i', 'o', 'u'] as const

function createDefaultProgress(): ProgressState {
  return {
    xp: 0,
    streak: 0,
    bestStreak: 0,
    answerCount: 0,
    correctCount: 0,
    mastery: {},
    reviews: {},
    familyStats: {},
  }
}

function loadProgress(): ProgressState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return createDefaultProgress()
    }

    const parsed = JSON.parse(stored) as Partial<ProgressState>
    const defaults = createDefaultProgress()

    return {
      ...defaults,
      ...parsed,
      mastery: parsed.mastery ?? defaults.mastery,
      reviews: parsed.reviews ?? defaults.reviews,
      familyStats: parsed.familyStats ?? defaults.familyStats,
    }
  } catch {
    return createDefaultProgress()
  }
}

function saveProgress(progress: ProgressState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
}

function verbId(verb: Verb) {
  return verb.infinitive
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

function familyToTokens(family: string) {
  if (family.startsWith('-en')) {
    const rest = family.slice(3)
    const tail = rest.startsWith('-') ? rest.slice(1).split('-').filter(Boolean) : []

    return ['-en', ...tail]
  }

  if (family === 'other') {
    return ['other']
  }

  return family.split('-')
}

function tokenLabel(token: string) {
  return token === 'other' ? 'other' : token
}

function buildPatternChoices(correctFamily: string) {
  const distractors = shuffle(families.filter((family) => family !== correctFamily)).slice(0, 2)
  return shuffle([correctFamily, ...distractors])
}

function pickNextVerb(progress: ProgressState, previousId?: string) {
  const reviewIds = Object.keys(progress.reviews).filter((id) => id !== previousId)
  const shouldReview = reviewIds.length > 0 && Math.random() < 0.7
  const reviewPool = reviewIds
    .map((id) => verbs.find((verb) => verbId(verb) === id))
    .filter((verb): verb is Verb => Boolean(verb))
  const fullPool = verbs.filter((verb) => verbId(verb) !== previousId)
  const pool = shouldReview && reviewPool.length > 0 ? reviewPool : fullPool

  return pool[Math.floor(Math.random() * pool.length)] ?? verbs[0]
}

function createRound(progress: ProgressState, previousId?: string): RoundState {
  const verb = pickNextVerb(progress, previousId)

  return {
    verb,
    step: 0,
    hadMistake: false,
    mistakes: 0,
    patternChoices: buildPatternChoices(verb.family),
  }
}

function createInitialSession(): InitialSession {
  const progress = loadProgress()

  return {
    progress,
    round: createRound(progress),
  }
}

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase('de-DE').normalize('NFC').replace(/ß/g, 'ss')
}

function isVowel(char: string) {
  return ['a', 'e', 'i', 'o', 'u'].includes(char.toLocaleLowerCase('de-DE'))
}

function addReviewEntry(
  reviews: Record<string, ReviewEntry>,
  verb: Verb,
  shouldReset: boolean,
) {
  const id = verbId(verb)
  const existing = reviews[id]

  return {
    ...reviews,
    [id]: {
      verb,
      perfectCycles: shouldReset ? 0 : existing?.perfectCycles ?? 0,
      mistakes: (existing?.mistakes ?? 0) + 1,
      addedAt: existing?.addedAt ?? Date.now(),
    },
  }
}

function finishCycle(
  progress: ProgressState,
  verb: Verb,
  result: PendingRoundResult,
): ProgressState {
  const id = verbId(verb)
  const familyRecord = progress.familyStats[verb.family] ?? {
    attempts: 0,
    perfect: 0,
    mistakes: 0,
  }
  const familyStats = {
    ...progress.familyStats,
    [verb.family]: {
      attempts: familyRecord.attempts + 1,
      perfect: familyRecord.perfect + (result.hadMistake ? 0 : 1),
      mistakes: familyRecord.mistakes + result.mistakes,
    },
  }
  const mastery = { ...progress.mastery }
  const reviews = { ...progress.reviews }
  let xp = progress.xp

  if (result.hadMistake) {
    if (reviews[id]) {
      reviews[id] = {
        ...reviews[id],
        perfectCycles: 0,
      }
    }
  } else {
    xp += 15
    mastery[id] = Math.min((mastery[id] ?? 0) + 1, 3)

    if (reviews[id]) {
      const perfectCycles = reviews[id].perfectCycles + 1

      if (perfectCycles >= 3) {
        delete reviews[id]
      } else {
        reviews[id] = {
          ...reviews[id],
          perfectCycles,
        }
      }
    }
  }

  return {
    ...progress,
    xp,
    mastery,
    reviews,
    familyStats,
  }
}

function buildFamilySummaries(progress: ProgressState): FamilySummary[] {
  return families.map((family) => {
    const familyVerbs = verbs.filter((verb) => verb.family === family)
    const masteryPoints = familyVerbs.reduce(
      (total, verb) => total + Math.min(progress.mastery[verbId(verb)] ?? 0, 3),
      0,
    )
    const maxPoints = familyVerbs.length * 3
    const record = progress.familyStats[family] ?? {
      attempts: 0,
      perfect: 0,
      mistakes: 0,
    }
    const inReview = familyVerbs.filter((verb) => progress.reviews[verbId(verb)]).length

    return {
      family,
      percent: maxPoints === 0 ? 0 : Math.round((masteryPoints / maxPoints) * 100),
      attempts: record.attempts,
      perfect: record.perfect,
      mistakes: record.mistakes,
      inReview,
    }
  })
}

function ColoredWord({ word, compact = false }: { word: string; compact?: boolean }) {
  return (
    <span className={compact ? 'colored-word compact' : 'colored-word'} aria-label={word}>
      {Array.from(word).map((char, index) => {
        const lower = char.toLocaleLowerCase('de-DE')

        return isVowel(char) ? (
          <span className={`vowel vowel-${lower}`} key={`${char}-${index}`}>
            {char}
          </span>
        ) : (
          <span className="letter" key={`${char}-${index}`}>
            {char}
          </span>
        )
      })}
    </span>
  )
}

function MaskedWord({
  answer,
  word,
}: {
  answer: string
  word: string
}) {
  const answerLetters = Array.from(answer)

  return (
    <span className="masked-word" aria-label={word}>
      {Array.from(word).map((char, index) => {
        if (!isVowel(char)) {
          return (
            <span className="masked-letter" key={`${char}-${index}`}>
              {char}
            </span>
          )
        }

        const value = answerLetters[index]?.toLocaleLowerCase('de-DE') ?? ''

        return (
          <span
            className={`hidden-vowel-slot ${isVowel(value) ? `vowel-fill-${value}` : ''}`}
            key={`${char}-${index}`}
          >
            {isVowel(value) ? value : ''}
          </span>
        )
      })}
    </span>
  )
}

function SentencePrompt({
  disabled,
  onChange,
  sentence,
  value,
}: {
  disabled: boolean
  onChange: (value: string) => void
  sentence: string
  value: string
}) {
  const parts = sentence.split('_____')

  return (
    <p className="sentence-line">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <input
              autoCapitalize="none"
              autoComplete="off"
              className="sentence-gap-input"
              disabled={disabled}
              inputMode="text"
              onChange={(event) => onChange(event.target.value)}
              value={value}
            />
          ) : null}
        </span>
      ))}
    </p>
  )
}

function SentenceLine({ sentence, answer }: { sentence: string; answer: string }) {
  const parts = sentence.split('_____')

  return (
    <p className="sentence-line">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <span className="sentence-answer">
              <ColoredWord word={answer} compact />
            </span>
          ) : null}
        </span>
      ))}
    </p>
  )
}

function PatternToken({ token }: { token: string }) {
  const tokenLetters = Array.from(token)
  const isVowelCluster = tokenLetters.every((char) =>
    VOWEL_TOKENS.includes(char as (typeof VOWEL_TOKENS)[number]),
  )

  if (!isVowelCluster) {
    return <span className="plain-pattern-token">{tokenLabel(token)}</span>
  }

  return (
    <span className="pattern-token">
      {tokenLetters.map((char, index) => (
        <span className={`vowel-box vowel-box-${char}`} key={`${char}-${index}`}>
          {char}
        </span>
      ))}
    </span>
  )
}

function PatternDisplay({ family }: { family: string }) {
  return (
    <span className="pattern-display" aria-label={tokenLabel(family)}>
      {familyToTokens(family).map((token, index) => (
        <span className="pattern-piece" key={`${token}-${index}`}>
          <PatternToken token={token} />
          {index < familyToTokens(family).length - 1 ? <span className="dash">-</span> : null}
        </span>
      ))}
    </span>
  )
}

function App() {
  const [initialSession] = useState<InitialSession>(() => createInitialSession())
  const [progress, setProgress] = useState<ProgressState>(() => initialSession.progress)
  const [round, setRound] = useState<RoundState>(() => initialSession.round)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [pendingResult, setPendingResult] = useState<PendingRoundResult | null>(null)

  const familySummaries = useMemo(() => buildFamilySummaries(progress), [progress])
  const masteredFamilies = familySummaries.filter((summary) => summary.percent === 100).length
  const accuracy =
    progress.answerCount === 0
      ? 0
      : Math.round((progress.correctCount / progress.answerCount) * 100)
  const currentFormStep = round.step < 3 ? FORM_STEPS[round.step as FormStepIndex] : null
  const reviewCount = Object.keys(progress.reviews).length

  useEffect(() => {
    saveProgress(progress)
  }, [progress])

  function recordAnswer(isCorrect: boolean) {
    setProgress((current) => {
      const streak = isCorrect ? current.streak + 1 : 0
      const xpGain = isCorrect ? (round.step === 3 ? 8 : 5) : 0

      return {
        ...current,
        xp: current.xp + xpGain,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        answerCount: current.answerCount + 1,
        correctCount: current.correctCount + (isCorrect ? 1 : 0),
        reviews: isCorrect
          ? current.reviews
          : addReviewEntry(current.reviews, round.verb, true),
      }
    })
  }

  function markRoundMistake() {
    setRound((current) => ({
      ...current,
      hadMistake: true,
      mistakes: current.mistakes + 1,
    }))
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (feedback) {
      advanceFormStep()
      return
    }

    if (!currentFormStep) {
      return
    }

    const expected = round.verb[currentFormStep.key]
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(expected)
    recordAnswer(isCorrect)

    if (!isCorrect) {
      markRoundMistake()
    }

    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: isCorrect ? 'Correct' : 'Almost',
      detail: expected,
    })
  }

  function advanceFormStep() {
    const nextStep = (round.step + 1) as StepIndex

    setRound((current) => ({
      ...current,
      step: nextStep,
    }))
    setAnswer('')
    setFeedback(null)
  }

  function submitPattern(pattern: string) {
    if (feedback || !pattern) {
      return
    }

    const isCorrect = pattern === round.verb.family
    const result = {
      hadMistake: round.hadMistake || !isCorrect,
      mistakes: round.mistakes + (isCorrect ? 0 : 1),
    }

    recordAnswer(isCorrect)

    if (!isCorrect) {
      markRoundMistake()
    }

    setPendingResult(result)
    setFeedback({
      tone: isCorrect ? 'success' : 'error',
      title: 'Correct pattern',
      detail: round.verb.family,
    })
  }

  function completeRound() {
    if (!pendingResult) {
      return
    }

    const nextProgress = finishCycle(progress, round.verb, pendingResult)

    setProgress(nextProgress)
    setRound(createRound(nextProgress, verbId(round.verb)))
    setAnswer('')
    setFeedback(null)
    setPendingResult(null)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">German Verb Patterns</p>
          <h1>Verb Patterns</h1>
        </div>
        <div className="level-pill">
          <span>{progress.xp}</span>
          <small>XP</small>
        </div>
      </header>

      <section className="score-grid" aria-label="Progress">
        <div className="score-tile">
          <span>{progress.streak}</span>
          <small>streak</small>
        </div>
        <div className="score-tile">
          <span>{reviewCount}</span>
          <small>review</small>
        </div>
        <div className="score-tile">
          <span>{masteredFamilies}/{families.length}</span>
          <small>families</small>
        </div>
        <div className="score-tile">
          <span>{accuracy}%</span>
          <small>accuracy</small>
        </div>
      </section>

      <section className={`practice-card ${feedback?.tone ?? ''}`}>
        <div className="card-topline">
          <p>{currentFormStep?.name ?? 'Pattern'}</p>
          <div className="step-dots" aria-label={`Step ${round.step + 1} of 4`}>
            {[0, 1, 2, 3].map((step) => (
              <span className={step === round.step ? 'active' : ''} key={step} />
            ))}
          </div>
        </div>

        {currentFormStep ? (
          <form className="answer-flow" onSubmit={handleFormSubmit}>
            <SentencePrompt
              disabled={Boolean(feedback)}
              onChange={setAnswer}
              sentence={round.verb[currentFormStep.sentenceKey]}
              value={answer}
            />
            <MaskedWord
              answer={answer}
              word={round.verb[currentFormStep.key]}
            />

            {feedback ? (
              <div className="feedback-strip" role="status">
                <strong>{feedback.title}</strong>
                <SentenceLine sentence={round.verb[currentFormStep.sentenceKey]} answer={feedback.detail} />
              </div>
            ) : null}

            <button className="primary-action" type="submit">
              {feedback ? 'Continue' : 'Check'}
            </button>
          </form>
        ) : (
          <div className="pattern-flow">
            <div className="forms-stack" aria-label="Forms">
              <ColoredWord word={round.verb.infinitive} />
              <ColoredWord word={round.verb.praeteritum} />
              <ColoredWord word={round.verb.partizip} />
            </div>

            <h2>What is the vowel pattern?</h2>

            <div className="choice-stack">
              {round.patternChoices.map((family) => (
                <button
                  className="pattern-choice"
                  disabled={Boolean(feedback)}
                  key={family}
                  onClick={() => submitPattern(family)}
                  type="button"
                >
                  <PatternDisplay family={family} />
                </button>
              ))}
            </div>

            {feedback ? (
              <div className="feedback-strip pattern-feedback" role="status">
                <strong>{feedback.title}</strong>
                <PatternDisplay family={feedback.detail} />
              </div>
            ) : null}

            {feedback ? (
              <button className="primary-action" onClick={completeRound} type="button">
                New round
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="review-panel">
        <div>
          <p className="panel-label">Review</p>
          <strong>{reviewCount}</strong>
        </div>
        <div>
          <p className="panel-label">Best streak</p>
          <strong>{progress.bestStreak}</strong>
        </div>
      </section>

      <section className="family-panel">
        <div className="panel-header">
          <p className="panel-label">Patterns</p>
          <strong>{masteredFamilies} mastered</strong>
        </div>
        <div className="family-list">
          {familySummaries.map((summary) => (
            <article className="family-row" key={summary.family}>
              <div className="family-line">
                <PatternDisplay family={summary.family} />
                <span>{summary.percent}%</span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${summary.percent}%` }} />
              </div>
              <div className="family-meta">
                <span>{summary.perfect}/{summary.attempts}</span>
                <span>{summary.mistakes} mistakes</span>
                <span>{summary.inReview} in review</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
