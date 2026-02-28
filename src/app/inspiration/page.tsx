export default function InspirationPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Inspiration</h1>
      <p className="mt-2 text-gray-600">
        Explore celebrity denim looks and the anchors behind your recommendations.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-5">
        <div className="text-sm text-gray-700">
          Coming next:
          <ul className="mt-3 list-disc pl-6 text-gray-600">
            <li>Celebrity look gallery</li>
            <li>Filter by vibe / wash / rise / fit</li>
            <li>Tap a look to “Try this vibe”</li>
          </ul>
        </div>
      </div>
    </main>
  );
}