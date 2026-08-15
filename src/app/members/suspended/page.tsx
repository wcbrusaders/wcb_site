// Minimal notice for members whose status is interim/banned. No data fetch —
// the members-area layout has already done the status lookup and redirected
// here; this page must stay simple and always renderable (it's the landing
// spot the guard sends blocked members to, so it can't itself depend on
// anything that could fail or re-trigger the guard).
export default function SuspendedPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
      <h1 className="text-2xl font-bold mb-4">Access paused</h1>
      <p className="text-foreground/70">
        Your access is currently paused. Please contact the board.
      </p>
    </div>
  )
}
