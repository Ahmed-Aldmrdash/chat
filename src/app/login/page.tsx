import { LoginForm } from "./LoginForm";

export const metadata = { title: "تسجيل الدخول — الشات" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-wa-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-wa-primary text-3xl">
            💬
          </div>
          <h1 className="text-2xl font-semibold text-wa-text">أهلًا بيك</h1>
          <p className="mt-1 text-sm text-wa-secondary">
            سجّل دخول بالبيانات اللي وصلتك
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs text-wa-secondary">
          مفيش تسجيل عام — الحسابات بتتعمل بمعرفة صاحب التطبيق بس
        </p>
      </div>
    </main>
  );
}
