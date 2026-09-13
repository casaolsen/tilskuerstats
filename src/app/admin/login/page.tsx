import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function login(formData: FormData) {
  "use server";
  const password = formData.get("password");
  const expected = process.env.ADMIN_PASSWORD;
  if (expected && typeof password === "string" && password === expected) {
    (await cookies()).set("admin_session", password, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/admin");
  }
  redirect("/admin/login?error=1");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 py-16">
      <h1 className="text-xl font-semibold">Admin-login</h1>
      {!process.env.ADMIN_PASSWORD && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <code>ADMIN_PASSWORD</code> er ikke sat som environment variable på denne deployment.
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: "#e34948" }}>
          Forkert kodeord.
        </p>
      )}
      <form action={login} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Kodeord"
          required
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button
          type="submit"
          className="rounded px-3 py-2 text-sm font-medium text-white"
          style={{ background: "var(--seq-450)" }}
        >
          Log ind
        </button>
      </form>
    </div>
  );
}
