export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40 }}>
      <h1>GTB OS API</h1>
      <p>This is the backend service. The app lives in the web client.</p>
      <ul>
        <li>
          <code>/api/health</code> — health check
        </li>
        <li>
          <code>/api/me</code> — current user
        </li>
        <li>
          <code>/api/model/*</code> — ZenStack data API
        </li>
      </ul>
    </main>
  );
}
