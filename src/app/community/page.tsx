"use client";

// المجتمع — a timeline of fish photos from signed-in users, with likes and comments.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flag, MessageCircle, Plus, Send, ThumbsUp, Trash2, Users } from "lucide-react";
import { CommunityComposer } from "@/components/CommunityComposer";
import { useToast } from "@/components/Toast";
import { Button, Card, Empty, Input, LinkButton, Notice, PageHeader, Spinner, cn } from "@/components/ui";
import { addComment, deleteComment, deletePost, fetchComments, fetchFeed, markCommunitySeen, report, setLike, signedUrls, useCommunityActivity, type Comment, type Post } from "@/lib/community";
import { useIsAdmin } from "@/lib/admin";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { adminHide } from "@/lib/community";

function ago(iso: string, lang: "ar" | "en"): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  const m = Math.round(s / 60);
  if (m < 1) return lang === "ar" ? "الحين" : "now";
  if (m < 60) return lang === "ar" ? `قبل ${m} دقيقة` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "ar" ? `قبل ${h} ساعة` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === "ar" ? `قبل ${d} يوم` : `${d} d ago`;
}

export default function CommunityPage() {
  const { mode, user } = useStore();
  const { t, lang } = useI18n();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const activity = useCommunityActivity();
  const [posts, setPosts] = useState<Post[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetchFeed(before);
        setPosts((cur) => (before ? [...cur, ...r.posts] : r.posts));
        setMore(r.more);
        const u = await signedUrls(r.posts.map((p) => p.photo_path));
        setUrls((cur) => ({ ...cur, ...u }));
      } catch (e) {
        setErr((e as Error).message === "SIGN_IN" ? t("سجّل الدخول لعرض المجتمع", "Sign in to see the community") : navigator.onLine ? t("تعذر تحميل المنشورات", "Couldn't load posts") : t("ما فيه إنترنت", "You're offline"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (mode !== "cloud") return;
    void load();
    markCommunitySeen();
  }, [mode, load]);

  if (mode !== "cloud" || !user) {
    return (
      <>
        <PageHeader title={t("المجتمع", "Community")} />
        <Card className="space-y-3 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-ocean/40 bg-ocean/10">
            <Users className="size-8 text-ocean" />
          </div>
          <div className="text-lg font-bold">{t("مجتمع سجي", "SAJJI community")}</div>
          <p className="text-sm text-ink-2">{t("شارك صيدتك مع باقي الصيادين، وشوف صيدهم وعلّق وأعجب. يحتاج حساب.", "Share your catch with other fishermen, see theirs, comment and like. Needs an account.")}</p>
          <LinkButton href="/login?next=/community" size="lg" className="w-full">
            {t("تسجيل الدخول / إنشاء حساب", "Sign in / Create account")}
          </LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("المجتمع", "Community")} />
      {activity.total > 0 && (
        <Notice tone="info" className="mb-3">
          {t(`على منشوراتك: ${activity.comments} تعليق جديد و${activity.likes} إعجاب`, `On your posts: ${activity.comments} new comments and ${activity.likes} likes`)}
        </Notice>
      )}
      <Button size="lg" className="mb-3 w-full" onClick={() => setCompose(true)}>
        <Plus className="size-5" /> {t("منشور جديد", "New post")}
      </Button>
      {err && <Notice tone="warn">{err}</Notice>}
      {!posts.length && loading && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}
      {!posts.length && !loading && !err && (
        <Empty icon="🐟" title={t("ما فيه منشورات بعد", "No posts yet")}>
          {t("كن أول من ينشر صيدته!", "Be the first to share a catch!")}
        </Empty>
      )}
      <div className="space-y-3">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            url={urls[p.photo_path]}
            userId={user.id}
            isAdmin={isAdmin}
            expanded={open === p.id}
            onToggle={() => setOpen(open === p.id ? null : p.id)}
            onChange={(np) => setPosts((cur) => cur.map((x) => (x.id === np.id ? np : x)))}
            onGone={() => setPosts((cur) => cur.filter((x) => x.id !== p.id))}
            toast={toast}
          />
        ))}
      </div>
      {more && (
        <Button variant="secondary" className="mt-3 w-full" loading={loading} onClick={() => load(posts[posts.length - 1]?.created_at)}>
          {t("عرض المزيد", "Load more")}
        </Button>
      )}
      <CommunityComposer
        open={compose}
        onClose={() => setCompose(false)}
        onPosted={() => {
          toast(t("تم نشر صيدتك", "Posted"));
          void load();
        }}
      />
      <p className="mt-4 text-center text-[11px] text-muted">
        <Link href="/settings">{t("أنت تشارك باسمك المعروض في حسابي", "You post under the name shown in My account")}</Link>
      </p>
    </>
  );
}

function PostCard({
  post,
  url,
  userId,
  isAdmin,
  expanded,
  onToggle,
  onChange,
  onGone,
  toast,
}: {
  post: Post;
  url?: string;
  userId: string;
  isAdmin: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: Post) => void;
  onGone: () => void;
  toast: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (expanded && comments == null) void fetchComments(post.id).then(setComments, () => setComments([]));
  }, [expanded, comments, post.id]);

  const like = async () => {
    const next = { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) };
    onChange(next);
    try {
      await setLike(userId, post.id, next.liked);
    } catch {
      onChange(post);
    }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addComment(userId, post.id, text);
      setText("");
      setComments(await fetchComments(post.id));
      onChange({ ...post, comments: post.comments + 1 });
    } catch (e) {
      toast((e as Error).message === "DAILY_LIMIT" ? t("وصلت حد التعليقات اليومي", "Daily comment limit reached") : t("تعذر إرسال التعليق", "Couldn't send the comment"));
    } finally {
      setBusy(false);
    }
  };
  const doReport = async (target: { post?: string; comment?: string }) => {
    const reason = prompt(t("سبب البلاغ (اختياري):", "Reason for the report (optional):")) ?? null;
    if (reason === null) return;
    try {
      await report(userId, target, reason);
      toast(t("وصل بلاغك، شكراً", "Report sent, thank you"));
    } catch {
      toast(t("تعذر إرسال البلاغ", "Couldn't send the report"));
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ocean/20 text-sm font-bold text-ocean">{post.author.replace("صياد ", "").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{post.author}</div>
          <div className="text-[11px] text-muted">
            {ago(post.created_at, lang)}
            {post.place_label ? ` · ${post.place_label}` : ""}
          </div>
        </div>
        {post.mine ? (
          <button
            type="button"
            aria-label={t("حذف", "Delete")}
            className="grid size-9 place-items-center rounded-full text-bad"
            onClick={async () => {
              if (!confirm(t("حذف منشورك؟", "Delete your post?"))) return;
              try {
                await deletePost(post);
                onGone();
              } catch {
                toast(t("تعذر الحذف", "Couldn't delete"));
              }
            }}
          >
            <Trash2 className="size-4" />
          </button>
        ) : (
          <button type="button" aria-label={t("إبلاغ", "Report")} className="grid size-9 place-items-center rounded-full text-muted" onClick={() => doReport({ post: post.id })}>
            <Flag className="size-4" />
          </button>
        )}
        {isAdmin && !post.mine && (
          <button
            type="button"
            className="rounded-lg border border-warn/50 px-2 py-1 text-[11px] text-warn"
            onClick={async () => {
              if (!confirm(t("إخفاء هذا المنشور؟", "Hide this post?"))) return;
              try {
                await adminHide({ post: post.id }, true);
                onGone();
              } catch {
                toast(t("تعذر الإخفاء", "Couldn't hide"));
              }
            }}
          >
            {t("إخفاء", "Hide")}
          </button>
        )}
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={post.species_name ?? ""} loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center bg-surface-2">
          <Spinner />
        </div>
      )}
      <div className="space-y-2 px-3.5 py-3">
        {(post.species_name || post.weight_kg != null) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {post.species_name && <span className="rounded-full border border-ocean/40 bg-ocean/10 px-2.5 py-1 font-semibold text-white">🐟 {post.species_name}</span>}
            {post.weight_kg != null && (
              <span className="rounded-full border border-line px-2.5 py-1 text-white">
                <bdi>{post.weight_kg}</bdi> {t("كغ", "kg")}
              </span>
            )}
          </div>
        )}
        {post.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
        <div className="flex items-center gap-4 pt-1 text-sm">
          <button type="button" onClick={like} className={cn("flex items-center gap-1.5", post.liked ? "text-ocean" : "text-ink-2")}>
            <ThumbsUp className={cn("size-5", post.liked && "fill-ocean/30")} /> <span className="text-white">{post.likes}</span>
          </button>
          <button type="button" onClick={onToggle} className="flex items-center gap-1.5 text-ink-2">
            <MessageCircle className="size-5" /> <span className="text-white">{post.comments}</span>
          </button>
        </div>
        {expanded && (
          <div className="space-y-2 border-t border-line/40 pt-3">
            {comments == null ? (
              <Spinner />
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="font-semibold text-ink-2">{c.author}</span>
                    <span className="flex items-center gap-2">
                      {ago(c.created_at, lang)}
                      {c.mine ? (
                        <button
                          type="button"
                          aria-label="delete comment"
                          onClick={async () => {
                            try {
                              await deleteComment(c.id);
                              setComments((cur) => (cur ?? []).filter((x) => x.id !== c.id));
                              onChange({ ...post, comments: Math.max(0, post.comments - 1) });
                            } catch {
                              toast(t("تعذر الحذف", "Couldn't delete"));
                            }
                          }}
                        >
                          <Trash2 className="size-3.5 text-bad" />
                        </button>
                      ) : (
                        <button type="button" aria-label="report comment" onClick={() => doReport({ comment: c.id })}>
                          <Flag className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap">{c.body}</div>
                </div>
              ))
            )}
            <div className="flex items-center gap-2">
              <Input value={text} maxLength={300} placeholder={t("اكتب تعليق…", "Write a comment…")} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} />
              <Button type="button" aria-label="send" loading={busy} onClick={send}>
                <Send className="size-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
