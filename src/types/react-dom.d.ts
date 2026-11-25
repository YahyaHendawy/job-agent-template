// Only the piece of react-dom the app uses directly (avoids adding @types/react-dom).
declare module "react-dom" {
  export function useFormStatus(): { pending: boolean; data: FormData | null; method: string | null; action: unknown };
}
