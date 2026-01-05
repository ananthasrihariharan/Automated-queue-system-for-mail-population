export default function Unauthorized() {
  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">
          Access Denied
        </h1>
        <p className="text-gray-600">
          You do not have permission to view this page.
        </p>
      </div>
    </div>
  )
}
