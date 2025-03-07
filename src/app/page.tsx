"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Spinner from "@/components/Spinner";
import { motion } from "framer-motion";

interface UserProfile {
  first_name: string;
  last_name: string;
  name: string;
  position: string;
  role: string;
}

// Definir el tipo Role para roles específicos
type Role =
  | "desarrollador"
  | "gerente"
  | "equipo"
  | "vendedor"
  | "administrativo"
  | "marketing";

// Componente Typewriter base (efecto de máquina de escribir)
type TypewriterProps = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
  onComplete?: () => void;
};

function Typewriter({
  text,
  speed = 50,
  startDelay = 0,
  className = "",
  onComplete,
}: TypewriterProps) {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    let index = 0;
    let timeoutId: NodeJS.Timeout;
    const startTyping = () => {
      if (index <= text.length) {
        setDisplayedText(text.substring(0, index));
        index++;
        timeoutId = setTimeout(startTyping, speed);
      } else if (onComplete) {
        onComplete();
      }
    };
    const startTimeout = setTimeout(startTyping, startDelay);
    return () => {
      clearTimeout(startTimeout);
      clearTimeout(timeoutId);
    };
  }, [text, speed, startDelay, onComplete]);

  return (
    <span className={className}>
      {displayedText}
      {displayedText !== text && <span className="cursor">|</span>}
      <style jsx>{`
        .cursor {
          display: inline-block;
          margin-left: 2px;
          animation: blink 1s steps(2, start) infinite;
        }
        @keyframes blink {
          to {
            visibility: hidden;
          }
        }
      `}</style>
    </span>
  );
}

// Componente para mostrar el mensaje animado una sola vez, quedando estático al completarse
type AnimatedMessageProps = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
  onComplete?: () => void;
};

function AnimatedMessage({
  text,
  speed,
  startDelay,
  className,
  onComplete,
}: AnimatedMessageProps) {
  const [finished, setFinished] = useState(false);
  return finished ? (
    <span className={className}>{text}</span>
  ) : (
    <Typewriter
      text={text}
      speed={speed}
      startDelay={startDelay}
      className={className}
      onComplete={() => {
        setFinished(true);
        if (onComplete) onComplete();
      }}
    />
  );
}

// Componente para el botón animado, que al finalizar queda estático
type AnimatedButtonProps = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
  onClick: () => void;
};

function AnimatedButton({
  text,
  speed,
  startDelay,
  className,
  onClick,
}: AnimatedButtonProps) {
  const [finished, setFinished] = useState(false);
  return finished ? (
    <motion.button
      className={className}
      onClick={onClick}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {text}
    </motion.button>
  ) : (
    <Typewriter
      text={text}
      speed={speed}
      startDelay={startDelay}
      className={className}
      onComplete={() => setFinished(true)}
    />
  );
}

const bubbleVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  // Estado para controlar la secuencia de la conversación:
  // 0: Saludo inicial de Juani
  // 1: Botón "Saludar 👋" (mensaje del usuario)
  // 2: Mensaje "¡Hola! 😃" de Juani
  // 3: Mensaje de bienvenida de Juani
  // 4: Botón "Perfecto! 👍" (mensaje del usuario)
  // 5: Texto con funcionalidades del sistema de Juani
  const [conversationStep, setConversationStep] = useState(0);

  // Obtener perfil de usuario
  useEffect(() => {
    if (!token) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error("Error al obtener el perfil");
        const data = await res.json();
        setUserProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [token]);

  // Definir mensajes de rol con tipado explícito
  const roleMessages: Record<Role, string> = {
    desarrollador:
      "como desarrollador 💻, explorando funcionalidades avanzadas.",
    gerente: "como gerente 📊, accediendo a herramientas de equipo.",
    equipo: "como parte del equipo 🤝, colaborando juntos.",
    vendedor: "como vendedor 🛒, optimizando estrategias de venta.",
    administrativo: "como administrativo 📑, gestionando operaciones.",
    marketing: "como experto en marketing 📈, potenciando campañas.",
  };

  // Obtener el mensaje de rol, haciendo cast al tipo Role
  const userRole = (userProfile?.role?.toLowerCase() as Role) || undefined;
  const roleMessage =
    userRole && roleMessages[userRole]
      ? roleMessages[userRole]
      : "para lograr tus objetivos, informarte y facilitarte la vida.";

  // Mensajes y textos
  const titleText = `Hola${userProfile?.first_name ? `, ${userProfile.first_name}` : ""}! Soy Juani 👋`;
  const newGreeting = "¡Hola! 😃";
  const welcomeMessage = `¡Fuiste elegido para testear nuestro nuevo sistema! 🚀
El propósito es acompañarte en tu camino ${roleMessage}
Muy pronto agregaré nuevas funcionalidades, como gráficos y otras herramientas, para potenciar tu gestión.`;
  const functionalitiesText = [
    `El sistema te permite agregar clientes, editarlos o eliminarlos.`,
    `Además, podes asociar reservas a esos clientes, añadirle servicios y generar facturas. ¡Explora sin miedo, estamos en etapa de prueba!`,
  ];

  // Velocidades para animación
  const greetingSpeed = 50;
  const welcomeSpeed = 30;
  const finalSpeed = 30;

  return (
    <ProtectedRoute>
      <motion.section
        className="flex w-full flex-col p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {loading ? (
          <Spinner />
        ) : (
          <div className="w-full space-y-4">
            <div className="flex flex-col space-y-4">
              {/* Bloque 0: Saludo inicial de Juani */}
              <motion.div
                key="block-0"
                variants={bubbleVariants}
                initial="hidden"
                animate="visible"
                transition={{ duration: 0.4 }}
                className="self-start rounded-2xl border border-black p-3 font-light dark:border-white/50"
              >
                <AnimatedMessage
                  text={titleText}
                  speed={greetingSpeed}
                  onComplete={() => {
                    if (conversationStep < 1) setConversationStep(1);
                  }}
                />
              </motion.div>

              {/* Bloque 1: Botón "Saludar 👋" (mensaje del usuario) */}
              {conversationStep >= 1 && (
                <motion.div
                  key="block-1"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="cursor-pointer self-end rounded-2xl bg-black p-3 text-white dark:bg-white dark:text-black"
                >
                  {conversationStep === 1 ? (
                    <AnimatedButton
                      text="Saludar 👋"
                      speed={greetingSpeed}
                      onClick={() => setConversationStep(2)}
                    />
                  ) : (
                    <span>Saludar 👋</span>
                  )}
                </motion.div>
              )}

              {/* Bloque 2: Mensaje "¡Hola! 😃" de Juani */}
              {conversationStep >= 2 && (
                <motion.div
                  key="block-2"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="self-end rounded-2xl bg-black p-3 text-white dark:bg-white dark:text-black"
                >
                  {conversationStep === 2 ? (
                    <AnimatedMessage
                      text={newGreeting}
                      speed={greetingSpeed}
                      onComplete={() => setConversationStep(3)}
                    />
                  ) : (
                    <span>{newGreeting}</span>
                  )}
                </motion.div>
              )}

              {/* Bloque 3: Mensaje de bienvenida de Juani */}
              {conversationStep >= 3 && (
                <motion.div
                  key="block-3"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="self-start whitespace-pre-wrap rounded-2xl border border-black p-3 font-light dark:border-white/50"
                >
                  {conversationStep === 3 ? (
                    <AnimatedMessage
                      text={welcomeMessage}
                      speed={welcomeSpeed}
                      onComplete={() => setConversationStep(4)}
                    />
                  ) : (
                    <span>{welcomeMessage}</span>
                  )}
                </motion.div>
              )}

              {/* Bloque 4: Botón "Entendido! 👍" (mensaje del usuario) */}
              {conversationStep >= 4 && (
                <motion.div
                  key="block-4"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="cursor-pointer self-end rounded-2xl bg-black p-3 text-white dark:bg-white dark:text-black"
                >
                  {conversationStep === 4 ? (
                    <AnimatedButton
                      text="Entendido! 👍"
                      speed={finalSpeed}
                      onClick={() => setConversationStep(5)}
                      className="cursor-pointer"
                    />
                  ) : (
                    <span>Entendido! 👍</span>
                  )}
                </motion.div>
              )}

              {/* Bloque 5: Texto con funcionalidades de Juani */}
              {conversationStep >= 5 && (
                <motion.div
                  key="block-5"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="self-start rounded-2xl border border-black p-3 dark:border-white/50"
                >
                  {conversationStep === 5 ? (
                    <AnimatedMessage
                      text={functionalitiesText[0]}
                      speed={welcomeSpeed}
                      onComplete={() => setConversationStep(6)}
                    />
                  ) : (
                    <span className="font-light">{functionalitiesText[0]}</span>
                  )}
                </motion.div>
              )}
              {/* Bloque 6: Segundo texto con funcionalidades de Juani */}
              {conversationStep >= 6 && (
                <motion.div
                  key="block-6"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="self-start rounded-2xl border border-black p-3 dark:border-white/50"
                >
                  {conversationStep === 6 ? (
                    <AnimatedMessage
                      text={functionalitiesText[1]}
                      speed={welcomeSpeed}
                      onComplete={() => setConversationStep(7)}
                    />
                  ) : (
                    <span className="font-light">{functionalitiesText[1]}</span>
                  )}
                </motion.div>
              )}
              {/* Bloque 7: Card con datos del usuario */}
              {conversationStep >= 7 && userProfile !== null && (
                <motion.div
                  key="block-7"
                  variants={bubbleVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ duration: 0.4 }}
                  className="self-start rounded-2xl border border-black p-3 dark:border-white/50"
                >
                  <p className="font-light">
                    <span className="font-medium">Posición:</span>{" "}
                    {userProfile.position}
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </motion.section>
    </ProtectedRoute>
  );
}
