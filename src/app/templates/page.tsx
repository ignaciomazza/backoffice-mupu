// src/app/templates/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import QuoteForm, { SimpleQuote } from "@/components/templates/QuoteForm";
import ConfirmationForm from "@/components/templates/ConfirmationForm";
import QuoteDocument from "@/components/templates/QuoteDocument";
import ConfirmationDocument from "@/components/templates/ConfirmationDocument";
import QuotePreview from "@/components/templates/QuotePreview";
import { Confirmation, User } from "@/types";
import { useAuth } from "@/context/AuthContext";
import Spinner from "@/components/Spinner";
import ProtectedRoute from "@/components/ProtectedRoute";
import ConfirmationPreview from "@/components/templates/confirmationPreview";
import { authFetch } from "@/utils/authFetch";

type DocType = "quote" | "confirmation";
type DocumentData = SimpleQuote | Confirmation;

export default function NewDocPage() {
  const [docType, setDocType] = useState<DocType>("quote");
  const [data, setData] = useState<DocumentData | null>(null);

  const { token } = useAuth();
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoadingPage(true);
        const res = await authFetch(
          "/api/user/profile",
          { signal: controller.signal },
          token,
        );
        if (!res.ok) throw new Error("Error al cargar perfil");
        const data: User = await res.json();
        setUserProfile(data);
      } catch (error) {
        if ((error as DOMException)?.name !== "AbortError") {
          console.error("Error fetching profile:", error);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingPage(false);
      }
    })();

    return () => controller.abort();
  }, [token]);

  return (
    <ProtectedRoute>
      {loadingPage ? (
        <div className="flex min-h-[80vh] items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6 p-6">
          <select
            className="w-full cursor-pointer appearance-none rounded-2xl border border-sky-950/10 p-2 px-3 outline-none backdrop-blur placeholder:font-light placeholder:tracking-wide dark:border-white/10 dark:bg-white/10 dark:text-white"
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value as DocType);
              setData(null);
            }}
          >
            <option value="quote">Cotización</option>
            <option value="confirmation">Confirmación</option>
          </select>

          {docType === "quote" ? (
            <QuoteForm onSubmit={setData} token={token} />
          ) : (
            <ConfirmationForm onSubmit={setData} token={token} />
          )}

          {/* vista previa */}
          {data && docType === "quote" && userProfile && (
            <QuotePreview quote={data as SimpleQuote} user={userProfile} />
          )}
          {data && docType === "confirmation" && userProfile && (
            <ConfirmationPreview
              confirmation={data as Confirmation}
              user={userProfile}
            />
          )}

          {data && userProfile && (
            <PDFDownloadLink
              key={`${docType}:${JSON.stringify(data)}`}
              document={
                docType === "quote" ? (
                  <QuoteDocument
                    quote={data as SimpleQuote}
                    user={userProfile}
                  />
                ) : (
                  <ConfirmationDocument
                    confirmation={data as Confirmation}
                    user={userProfile}
                  />
                )
              }
              fileName={
                docType === "quote"
                  ? `${(data as SimpleQuote).tripTitle}.pdf`
                  : `Confirmacion_${
                      (data as Confirmation).confirmationNumber
                    }.pdf`
              }
              className="mt-4 block w-fit cursor-pointer rounded-full bg-sky-100 px-6 py-2 text-sky-950 shadow-sm shadow-sky-950/20 transition-transform hover:scale-95 active:scale-90 dark:bg-white/10 dark:text-white dark:backdrop-blur"
            >
              {({ loading }) => (loading ? <Spinner /> : "Descargar PDF")}
            </PDFDownloadLink>
          )}
        </div>
      )}
    </ProtectedRoute>
  );
}
