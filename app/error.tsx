"use client";

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="bg-gray-900 border border-red-700 rounded-xl p-6 max-w-xl w-full font-mono text-sm space-y-2">
        <p className="text-red-400 font-bold text-base">Unhandled error</p>
        <p className="text-gray-300 break-all">{error.message}</p>
        {error.digest && (
          <p className="text-gray-600 text-xs">Digest: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
