import { useEffect, useState } from "react";
import { fetchSections } from "./api";
import { useSageChat } from "./chat";
import { AskScreen } from "./components/AskScreen";
import { BottomNav } from "./components/Chrome";
import { HomeScreen } from "./components/HomeScreen";
import { ReaderScreen } from "./components/ReaderScreen";
import { SavedScreen } from "./components/SavedScreen";
import { SectionScreen } from "./components/SectionScreen";
import { useSageStore } from "./store";
import type { AskContext, AskSource, Screen, Section } from "./types";
import "./App.css";

function App() {
  const {
    state,
    markDone,
    toggleSaved,
    remember,
    setSize,
    setTheme,
    isDone,
    isSaved,
  } = useSageStore();
  const chat = useSageChat();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsError, setSectionsError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);

  useEffect(() => {
    const controller = new AbortController();

    fetchSections(controller.signal)
      .then((loaded) => {
        setSections(loaded);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSectionsError(
          error instanceof Error
            ? error.message
            : "Could not reach the book service.",
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, [attempt]);

  const screen = stack[stack.length - 1];
  const activeSection =
    screen.name === "section"
      ? sections.find((section) => section.id === screen.sectionId)
      : undefined;

  function navigate(nextScreen: Screen) {
    setStack((current) => [...current, nextScreen]);
  }

  function replace(nextScreen: Screen) {
    setStack((current) => [...current.slice(0, -1), nextScreen]);
  }

  function goBack() {
    setStack((current) =>
      current.length > 1 ? current.slice(0, -1) : [{ name: "home" }],
    );
  }

  function selectTab(tab: "home" | "saved") {
    setStack([{ name: tab }]);
  }

  function retrySections() {
    setLoading(true);
    setSectionsError("");
    setAttempt((value) => value + 1);
  }

  function openSection(sectionId: number) {
    navigate({ name: "section", sectionId });
  }

  function openTopic(topicId: string) {
    navigate({ name: "reader", topicId });
  }

  function changeTopic(topicId: string) {
    replace({ name: "reader", topicId });
  }

  function openAsk(context?: AskContext) {
    navigate({ name: "ask", context });
  }

  function openSource(source: AskSource) {
    if (source.topicId) {
      navigate({ name: "reader", topicId: source.topicId });
      return;
    }
    if (source.sectionId) {
      navigate({ name: "section", sectionId: source.sectionId });
    }
  }

  return (
    <div className="app-frame">
      {screen.name === "home" && (
        <HomeScreen
          sections={sections}
          loading={loading}
          error={sectionsError}
          onRetry={retrySections}
          state={state}
          onOpenSection={openSection}
          onOpenTopic={openTopic}
          onAsk={openAsk}
        />
      )}

      {screen.name === "section" &&
        (activeSection ? (
          <SectionScreen
            key={activeSection.id}
            section={activeSection}
            state={state}
            isDone={isDone}
            onBack={goBack}
            onAsk={openAsk}
            onOpenTopic={openTopic}
          />
        ) : (
          <section className="screen missing-screen">
            <p>That collection is not available.</p>
            <button type="button" className="text-button" onClick={goBack}>
              Go back
            </button>
          </section>
        ))}

      {screen.name === "reader" && (
        <ReaderScreen
          key={screen.topicId}
          topicId={screen.topicId}
          sections={sections}
          onBack={goBack}
          onAsk={openAsk}
          onChangeTopic={changeTopic}
          isDone={isDone}
          markDone={markDone}
          isSaved={isSaved}
          toggleSaved={toggleSaved}
          remember={remember}
          size={state.size}
          theme={state.theme}
          setSize={setSize}
          setTheme={setTheme}
        />
      )}

      {screen.name === "ask" && (
        <AskScreen
          chat={chat}
          context={screen.context}
          sections={sections}
          onBack={goBack}
          onOpenSource={openSource}
        />
      )}

      {screen.name === "saved" && (
        <SavedScreen
          saved={state.saved}
          sections={sections}
          onOpenTopic={openTopic}
          onExplore={() => selectTab("home")}
        />
      )}

      {(screen.name === "home" || screen.name === "saved") && (
        <BottomNav
          active={screen.name}
          savedCount={state.saved.length}
          onHome={() => selectTab("home")}
          onSaved={() => selectTab("saved")}
          onAsk={() => openAsk()}
        />
      )}
    </div>
  );
}

export default App;
