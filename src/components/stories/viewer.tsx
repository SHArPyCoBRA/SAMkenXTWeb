/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/* @refresh reload */

import {animateSingle, cancelAnimationByKey} from '../../helpers/animation';
import cancelEvent from '../../helpers/dom/cancelEvent';
import overlayCounter from '../../helpers/overlayCounter';
import throttle from '../../helpers/schedulers/throttle';
import classNames from '../../helpers/string/classNames';
import windowSize from '../../helpers/windowSize';
import {Document, DocumentAttribute, GeoPoint, MediaArea, MessageMedia, Photo, Reaction, StoryItem, StoryView, User, Chat as MTChat, PeerStories} from '../../layer';
import animationIntersector from '../animationIntersector';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import PeerTitle from '../peerTitle';
import SwipeHandler from '../swipeHandler';
import styles from './viewer.module.scss';
import {createSignal, createEffect, JSX, For, Accessor, onCleanup, createMemo, mergeProps, createContext, useContext, Context, ParentComponent, splitProps, untrack, on, getOwner, runWithOwner, createRoot, ParentProps, Suspense, batch, Signal, onMount, Setter, createReaction, Show, FlowComponent, useTransition, $TRACK, Owner, createRenderEffect} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {assign, isServer, Portal} from 'solid-js/web';
import {Transition} from 'solid-transition-group';
import rootScope from '../../lib/rootScope';
import ListenerSetter from '../../helpers/listenerSetter';
import {Middleware, getMiddleware} from '../../helpers/middleware';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapMessageEntities from '../../lib/richTextProcessor/wrapMessageEntities';
import tsNow from '../../helpers/tsNow';
import {LangPackKey, i18n, joinElementsWith} from '../../lib/langPack';
import formatDuration, {DurationType} from '../../helpers/formatDuration';
import {easeOutCubicApply} from '../../helpers/easing/easeOutCubic';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpAsChild from '../../helpers/dom/findUpAsChild';
import {onMediaCaptionClick} from '../appMediaViewer';
import InputFieldAnimated from '../inputFieldAnimated';
import ChatInput from '../chat/input';
import appImManager from '../../lib/appManagers/appImManager';
import Chat from '../chat/chat';
import middlewarePromise from '../../helpers/middlewarePromise';
import emoticonsDropdown from '../emoticonsDropdown';
import PopupPickUser from '../popups/pickUser';
import ButtonMenuToggle from '../buttonMenuToggle';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {copyTextToClipboard} from '../../helpers/clipboard';
import {toastNew} from '../toast';
import debounce from '../../helpers/schedulers/debounce';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import confirmationPopup from '../confirmationPopup';
import {formatDateAccordingToTodayNew, formatFullSentTime} from '../../helpers/date';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import onMediaLoad from '../../helpers/onMediaLoad';
import {AvatarNew} from '../avatarNew';
import documentFragmentToNodes from '../../helpers/dom/documentFragmentToNodes';
import clamp from '../../helpers/number/clamp';
import {SERVICE_PEER_ID} from '../../lib/mtproto/mtproto_config';
import idleController from '../../helpers/idleController';
import OverlayClickHandler from '../../helpers/overlayClickHandler';
import getStoryPrivacyType, {StoryPrivacyType} from '../../lib/appManagers/utils/stories/privacyType';
import wrapPeerTitle from '../wrappers/peerTitle';
import SetTransition from '../singleTransition';
import StackedAvatars from '../stackedAvatars';
import PopupElement from '../popups';
import {processDialogElementForReaction} from '../popups/reactedList';
import PopupReportMessages from '../popups/reportMessages';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import focusInput from '../../helpers/dom/focusInput';
import {wrapStoryMedia} from './preview';
import {StoriesContextPeerState, useStories, StoriesProvider} from './store';
import createUnifiedSignal from '../../helpers/solid/createUnifiedSignal';
import setBlankToAnchor from '../../lib/richTextProcessor/setBlankToAnchor';
import liteMode from '../../helpers/liteMode';
import Icon, {getIconContent} from '../icon';
import {ChatReactionsMenu} from '../chat/reactionsMenu';
import setCurrentTime from '../../helpers/dom/setCurrentTime';
import ReactionElement from '../chat/reaction';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import wrapSticker from '../wrappers/sticker';
import createContextMenu from '../../helpers/dom/createContextMenu';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';
import isTargetAnInput from '../../helpers/dom/isTargetAnInput';
import {setQuizHint} from '../poll';
import {doubleRaf} from '../../helpers/schedulers';
import type {ListTransitionOptions} from '@solid-primitives/transition-group';
import {resolveElements, resolveFirst} from '@solid-primitives/refs';
import noop from '../../helpers/noop';
import {Modify} from '../../types';
import {IS_MOBILE} from '../../environment/userAgent';
import formatNumber from '../../helpers/number/formatNumber';

export const STORY_DURATION = 5e3;
const STORY_HEADER_AVATAR_SIZE = 32;
const STORY_SCALE_SMALL = 0.33;
const STORIES_PRESERVE = 2;
const STORIES_PRESERVE_HIDDEN = 2;
let CHANGELOG_PEER_ID = SERVICE_PEER_ID;

rootScope.addEventListener('app_config', (appConfig) => {
  const userId = appConfig.stories_changelog_user_id;
  CHANGELOG_PEER_ID = userId ? userId.toPeerId(false) : SERVICE_PEER_ID;
});

const x = new OverlayClickHandler(undefined, true);

const createCleaner = () => {
  const [clean, setClean] = createSignal(false);
  onCleanup(() => setClean(true));
  return clean;
};

export const createMiddleware = () => {
  const middleware = getMiddleware();
  onCleanup(() => middleware.destroy());
  return middleware;
};

const ButtonIconTsx = (props: {icon?: Icon, noRipple?: boolean} & JSX.HTMLAttributes<HTMLButtonElement>) => {
  const [, rest] = splitProps(props, ['icon', 'noRipple']);
  return (
    <button {...rest} class={classNames('btn-icon', props.class)} tabIndex={-1}>
      {props.icon ? Icon(props.icon) : props.children}
    </button>
  );
};

export const IconTsx = (props: {icon: Icon} & JSX.HTMLAttributes<HTMLSpanElement>) => {
  const [, rest] = splitProps(props, ['icon']);
  return (
    <span {...rest} class={classNames('tgico', props.class)}>
      {getIconContent(props.icon)}
    </span>
  );
};

const MessageInputField = (props: {}) => {
  const inputField = new InputFieldAnimated({
    placeholder: 'PreviewSender.CaptionPlaceholder',
    name: 'message',
    withLinebreaks: true
  });

  inputField.input.classList.replace('input-field-input', 'input-message-input');
  inputField.inputFake.classList.replace('input-field-input', 'input-message-input');

  return (
    <div class="input-message-container">
      {inputField.input}
      {inputField.inputFake}
    </div>
  );
};

export function createListTransition<T extends object>(
  source: Accessor<readonly T[]>,
  options: Modify<ListTransitionOptions<T>, {exitMethod?: ListTransitionOptions<T>['exitMethod'] | 'keep-relative'}>
): Accessor<T[]> {
  const initSource = untrack(source);

  if(isServer) {
    const copy = initSource.slice();
    return () => copy;
  }

  const {onChange} = options;

  // if appear is enabled, the initial transition won't have any previous elements.
  // otherwise the elements will match and transition skipped, or transitioned if the source is different from the initial value
  let prevSet: ReadonlySet<T> = new Set(options.appear ? undefined : initSource);
  const exiting = new WeakSet<T>();

  const [toRemove, setToRemove] = createSignal<T[]>([], {equals: false});
  const [isTransitionPending] = useTransition();

  const finishRemoved: (els: T[]) => void =
    options.exitMethod === 'remove' ?
      noop :
      (els) => {
        setToRemove((p) => (p.push(...els), p));
        for(const el of els) exiting.delete(el);
      };

  type RemovedOptions = {
    elements: T[],
    element: T,
    previousElements: T[],
    previousIndex: number,
    side: 'start' | 'end'
  };

  let handleRemoved: (options: RemovedOptions) => void;
  if(options.exitMethod === 'remove') {
    handleRemoved = noop;
  } else if(options.exitMethod === 'keep-index') {
    handleRemoved = (options) => options.elements.splice(options.previousIndex, 0, options.element);
  } else if(options.exitMethod === 'keep-relative') {
    handleRemoved = (options) => {
      let index: number;
      if(options.side === 'start') {
        index = options.previousIndex;
      } else {
        // index = options.elements.length - (options.previousElements.length - 1 - options.previousIndex);
        index = options.elements.length;
      }

      options.elements.splice(index, 0, options.element);
    };
  } else {
    handleRemoved = (options) => options.elements.push(options.element);
  }

  const compute = (prev: T[]) => {
    const elsToRemove = toRemove();
    const sourceList = source();
    (sourceList as any)[$TRACK]; // top level store tracking

    if(untrack(isTransitionPending)) {
      // wait for pending transition to end before animating
      isTransitionPending();
      return prev;
    }

    if(elsToRemove.length) {
      const next = prev.filter(e => !elsToRemove.includes(e));
      elsToRemove.length = 0;
      onChange({list: next, added: [], removed: [], unchanged: next, finishRemoved});
      return next;
    }

    return untrack(() => {
      const nextSet: ReadonlySet<T> = new Set(sourceList);
      const next: T[] = sourceList.slice();

      const added: T[] = [];
      const removed: T[] = [];
      const unchanged: T[] = [];

      for(const el of sourceList) {
        (prevSet.has(el) ? unchanged : added).push(el);
      }

      const removedOptions: Modify<RemovedOptions, {element?: T, previousIndex?: number}> = {
        elements: next,
        previousElements: prev,
        side: 'start'
      };

      let nothingChanged = !added.length;
      for(let i = 0; i < prev.length; ++i) {
        const el = prev[i]!;
        if(!nextSet.has(el)) {
          if(!exiting.has(el)) {
            removed.push(el);
            exiting.add(el);
          }

          removedOptions.element = el;
          removedOptions.previousIndex = i;

          handleRemoved(removedOptions as RemovedOptions);
        } else {
          removedOptions.side = 'end';
        }

        if(nothingChanged && el !== next[i]) {
          nothingChanged = false;
        }
      }

      // skip if nothing changed
      if(!removed.length && nothingChanged) {
        return prev;
      }

      onChange({list: next, added, removed, unchanged, finishRemoved});

      prevSet = nextSet;
      return next;
    });
  };

  return createMemo(compute, options.appear ? [] : initSource.slice());
}

export const TransitionGroup: FlowComponent<{
  noWait: Accessor<boolean>,
  transitions: WeakMap<Element, Accessor<boolean>>
}> = (props) => {
  const observeElement = (element: Element, callback: () => void) => {
    const transition = props.transitions.get(element);
    createEffect((prev) => {
      const t = transition();
      if(prev || t) {
        if(!t) {
          callback();
        }

        return true;
      }
    });
  };

  const disposers: Map<Element, () => void> = new Map();
  const exitElement = (element: Element, callback: () => void) => {
    createRoot((dispose) => {
      disposers.set(element, dispose);

      observeElement(element, () => {
        dispose();
        callback();
      });

      onCleanup(() => {
        if(disposers.get(element) === dispose) {
          disposers.delete(element);
        }
      });
    });
  };

  onCleanup(() => {
    disposers.forEach((dispose) => dispose());
  });

  const listTransition = createListTransition(resolveElements(() => props.children).toArray, {
    exitMethod: 'keep-relative',
    onChange: ({added, removed, finishRemoved}) => {
      for(const element of added) {
        const dispose = disposers.get(element);
        dispose?.();
      }

      if(props.noWait?.() || !liteMode.isAvailable('animations')) {
        finishRemoved(removed);
        return;
      }

      const filtered: Element[] = [];
      for(const element of removed) {
        if(!props.transitions.has(element)) {
          filtered.push(element);
          continue;
        }

        exitElement(element, () => {
          finishRemoved([element]);
        });
      }

      if(filtered.length) {
        finishRemoved(filtered);
      }
    }
  }) as unknown as JSX.Element;

  return listTransition;
};

export function createListenerSetter() {
  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());
  return listenerSetter;
}

const StorySlides = (props: {
  state: StoriesContextPeerState,
  index: Accessor<number>,
  currentStory: Accessor<StoryItem>,
  splitByDays?: boolean
}) => {
  let storyIndex: Accessor<number>, storiesForSlides: Accessor<StoryItem[]>;
  if(props.splitByDays) {
    const getStoryDateTimestamp = (storyItem: StoryItem.storyItem) => {
      const timestamp = storyItem.date;
      const date = new Date(timestamp * 1000);
      date.setHours(0, 0, 0);
      return date.getTime();
    };

    const storiesSplittedByDays = createMemo(() => {
      const stories = props.state.stories;
      const days: Record<number, StoryItem[]> = {};
      (stories as StoryItem.storyItem[]).forEach((story) => {
        const dateTimestamp = getStoryDateTimestamp(story);
        (days[dateTimestamp] ??= []).push(story);
      });
      return days;
    });

    storiesForSlides = createMemo(() => {
      const days = storiesSplittedByDays();
      const story = props.currentStory();
      const dateTimestamp = getStoryDateTimestamp(story as StoryItem.storyItem);
      return days[dateTimestamp];
    });

    storyIndex = createMemo(() => {
      const story = props.currentStory();
      const stories = storiesForSlides();
      // return props.state.index;
      return stories.indexOf(story);
    });
  } else {
    storiesForSlides = () => props.state.stories;
    storyIndex = () => props.state.index;
  }

  const slides = (
    <For each={storiesForSlides()}>
      {(_, i) => <StorySlide {...mergeProps(props, {slideIndex: i, storyIndex})} />}
    </For>
  );

  return slides;
};

const StorySlide = (props: {
  slideIndex: Accessor<number>,
  state: StoriesContextPeerState,
  storyIndex: Accessor<number>,
  index: Accessor<number>
}) => {
  const [progress, setProgress] = createSignal(0);
  const [stories] = useStories();

  const calculateAndSetProgress = () => {
    const elapsedTime = Date.now() - stories.startTime;
    const progress = elapsedTime / stories.storyDuration;
    setProgress(progress);
  };

  const onTick = () => {
    if(
      stories.peer !== props.state ||
      props.storyIndex() !== props.slideIndex() ||
      stories.paused
    ) {
      onPause();
      return false;
    }

    // if(stories.paused) {
    //   return true;
    // }

    calculateAndSetProgress();
    return true;
  };

  const onPause = () => {
    cancelAnimationByKey(ret);
  };

  const onPlay = () => {
    animateSingle(onTick, ret);
  };

  createEffect(() => { // on peer change
    if(stories.peer !== props.state) {
      onPause();
      return;
    }

    createEffect(on( // on story change
      () => [props.storyIndex(), props.slideIndex()],
      ([storyIndex, slideIndex]) => {
        const isActive = storyIndex === slideIndex;
        if(isActive) {
          setProgress(undefined);

          createEffect(() => { // on story toggle
            if(stories.paused || stories.buffering) {
              onPause();
            } else {
              onPlay();
            }
          });
        } else {
          onPause();
          setProgress(storyIndex > slideIndex ? 1 : undefined);
        }
      })
    );
  });

  const ret = (
    <div
      class={styles.ViewerStorySlidesSlide}
      // classList={{[styles.active]: index() > slideIndex()}}
      style={progress() !== undefined ? {'--progress': Math.min(100, progress() * 100) + '%'} : {}}
    />
  );

  return ret;
};

const DEFAULT_REACTION_EMOTICON = '❤';
const isDefaultReaction = (reaction: Reaction) => (reaction as Reaction.reactionEmoji)?.emoticon === DEFAULT_REACTION_EMOTICON;

const StoryInput = (props: {
  state: StoriesContextPeerState,
  currentStory: Accessor<StoryItem>,
  isActive: Accessor<boolean>,
  focusedSignal: Signal<boolean>,
  inputEmptySignal: Signal<boolean>,
  inputMenuOpenSignal: Signal<boolean>,
  isPublic: Accessor<boolean>,
  sendReaction: StorySendReaction,
  shareStory: () => void,
  reaction: Accessor<JSX.Element>,
  onShareButtonClick: (e: MouseEvent, listenTo: HTMLElement) => void,
  onMessageSent: () => void,
  setInputReady: Setter<boolean>,
  isFull: Accessor<boolean>
}) => {
  const [stories, actions] = useStories();
  const [focused, setFocused] = props.focusedSignal;
  const [inputEmpty, setInputEmpty] = props.inputEmptySignal;
  const [inputMenuOpen, setInputMenuOpen] = props.inputMenuOpenSignal;
  const [recording, setRecording] = createSignal(false);
  const middlewareHelper = createMiddleware();
  const middleware = middlewareHelper.get();

  const chat = new Chat(appImManager, rootScope.managers, false, {elements: true, sharedMedia: true});
  chat.setType('stories');
  chat.isStandalone = true;

  const onReactionClick = async() => {
    const story = props.currentStory() as StoryItem.storyItem;
    const isNewReaction = !story.sent_reaction;
    const reaction: Reaction = !isNewReaction ? undefined : {_: 'reactionEmoji', emoticon: DEFAULT_REACTION_EMOTICON};
    props.sendReaction({reaction, target: btnReactionEl});
  };

  let btnReactionEl: HTMLButtonElement;
  const btnReaction = (
    <ButtonIconTsx
      ref={btnReactionEl}
      onClick={onReactionClick}
      tabIndex={-1}
      class="btn-circle btn-reaction chat-input-secondary-button chat-secondary-button"
      noRipple={true}
    >
      {props.reaction()}
    </ButtonIconTsx>
  );

  const input = chat.input = new ChatInput(chat, appImManager, rootScope.managers, 'stories-input');
  input.noRipple = true;
  input.btnReaction = btnReactionEl;
  input.excludeParts = {
    replyMarkup: true,
    scheduled: true,
    downButton: true,
    reply: true,
    forwardOptions: true,
    mentionButton: true,
    attachMenu: true,
    commandsHelper: true,
    botCommands: true,
    emoticons: IS_MOBILE
  };
  input.globalMentions = true;
  input.getMiddleware = (...args) => middleware.create().get(...args);

  // const onMouseDown = (e: MouseEvent) => {
  //   if(
  //     focused() &&
  //     !findUpClassName(e.target, styles.ViewerStoryPrivacy) &&
  //     !findUpClassName(e.target, 'btn-icon') &&
  //     !findUpClassName(e.target, styles.small) &&
  //     !findUpAsChild(e.target as HTMLElement, input.emoticonsDropdown.getElement())
  //   ) {
  //     document.addEventListener('click', cancelEvent, {capture: true, once: true});
  //   }

  //   onFocusChange(false);
  // };

  const onClick = (e: MouseEvent) => {
    // if(!inputEmpty()) {
    //   return;
    // }

    const target = e.target as HTMLElement;
    const good = !findUpClassName(target, styles.ViewerStoryReactions) && (
      findUpClassName(target, styles.ViewerStory) ||
      target.classList.contains(styles.Viewer)
    );
    if(!good) {
      return;
    }

    cancelEvent(e);
    setFocused(false);
  };

  onCleanup(() => {
    if(navigationItem) {
      appNavigationController.removeItem(navigationItem);
      navigationItem = undefined;
    }
  });

  let navigationItem: NavigationItem;
  createEffect(
    on(
      () => focused(),
      (focused) => {
        if(focused) {
          playAfterFocus = untrack(() => !stories.paused);
          // document.addEventListener('mousedown', onMouseDown, {capture: true, once: true});
          document.addEventListener('click', onClick, {capture: true});
          appNavigationController.pushItem(navigationItem = {
            type: 'stories-focus',
            onPop: () => {
              setFocused(false);
            }
          });
        } else {
          // document.removeEventListener('mousedown', onMouseDown, {capture: true});
          document.removeEventListener('click', onClick, {capture: true});
          appNavigationController.removeItem(navigationItem);
          navigationItem = undefined;
        }

        actions.toggle(focused ? false : playAfterFocus);
        input.freezeFocused(focused);
        input.chatInput.classList.toggle('is-focused', focused);
        // input.setShrinking(!focused);
      },
      {defer: true}
    )
  );

  let playAfterFocus = false;
  input.onFocusChange = (_focused: boolean) => {
    if(input.emoticonsDropdown.isActive()) {
      return;
    }

    if(!_focused) {
      return;
    }

    setFocused(_focused);
  };

  let playAfter = false;
  const onMenuToggle = (open: boolean) => {
    if(open) {
      playAfter = !stories.paused;
    }

    actions.toggle(open ? false : playAfter);
    setInputMenuOpen(open);
  };
  input.onMenuToggle/*  = input.onRecording */ = onMenuToggle;
  input.construct();
  input.constructPeerHelpers();
  // input.setShrinking(true);
  // input.chatInput.classList.add(styles.hideOnSmall);
  // input.rowsWrapper.classList.add('night');
  input.messageInput.dataset.textColor = 'white';

  createEffect(() => {
    input.replyToStoryId = props.currentStory().id;
  });

  createEffect(() => {
    if(props.isActive()) {
      const onOpen = (): void => (onMenuToggle(true)/* , setFocused(true) */, undefined);
      const onClose = (): void => (onMenuToggle(false)/* , setFocused(false) */, undefined);
      emoticonsDropdown.addEventListener('open', onOpen);
      emoticonsDropdown.addEventListener('close', onClose);
      emoticonsDropdown.chatInput = input;

      onCleanup(() => {
        emoticonsDropdown.removeEventListener('open', onOpen);
        emoticonsDropdown.removeEventListener('close', onClose);
      });
    }
  });

  createEffect(() => {
    input.chatInput.classList.toggle('is-private', !props.isPublic());
    input.setCanForwardStory(props.isPublic());
  });

  createEffect(() => {
    const [_focused, _recording, isPublic] = [focused(), recording(), props.isPublic()];
    const isReactionButtonVisible = !_focused;
    const isMainButtonVisible = _focused ? true : isPublic;
    const isRecordingButtonVisible = _recording;
    const visibleButtons = Math.min(2, [
      isReactionButtonVisible,
      isMainButtonVisible,
      isRecordingButtonVisible
    ].reduce((acc, v) => acc + +v, 0));
    const chatInputSize = 48;
    const chatInputBtnSendMargin = 8;
    const chatInputPadding = props.isFull() ? 8 : 0;
    const focusOffset = props.isFull() ? 0 : 135;
    const width = stories.width - (chatInputSize + chatInputBtnSendMargin) * visibleButtons + (_focused ? focusOffset : 0) - chatInputPadding * 2;
    input.rowsWrapper.style.setProperty('width', width + 'px', 'important');
    input.chatInput.classList.toggle('is-focused', _focused);
  });

  chat.peerId = props.state.peerId;
  chat.onChangePeer({
    peerId: chat.peerId,
    type: 'stories'
  }, middlewarePromise(middleware)).then(() => {
    if(!middleware()) return;
    return chat.finishPeerChange({
      peerId: chat.peerId,
      middleware
    });
  }).then(() => {
    if(!middleware()) return;
    props.setInputReady(true);
  });

  onCleanup(() => {
    input.onFocusChange =
      input.onFileSelection =
      input.onMenuToggle =
      input.onRecording =
      input.onUpdateSendBtn =
      input.onMessageSent2 =
      input.forwardStoryCallback =
      undefined;
    middlewareHelper.destroy();
    chat.destroy();
  });

  input.onFileSelection = (promise) => {
    onMenuToggle(true);
    promise.finally(() => {
      onMenuToggle(false);
    });
  };

  input.onUpdateSendBtn = (icon) => {
    setInputEmpty(icon === 'record' || icon === 'forward');
  };

  input.onMessageSent2 = () => {
    blurActiveElement();
    setFocused(false);
    props.onMessageSent();
  };

  input.forwardStoryCallback = (e) => {
    props.onShareButtonClick(e, input.btnSendContainer);
  };

  input.onRecording = (recording) => {
    setRecording(recording);
  };

  return input.chatInput;
};

const JOINER = ' • ';

const KEEP_TOOLTIP = true;
const tooltipOverlayClickHandler = new OverlayClickHandler(undefined, true);
const showTooltip = ({
  element,
  container = element.parentElement,
  vertical,
  text,
  textElement,
  paddingX = 0,
  centerVertically,
  onClose
}: {
  element: HTMLElement,
  container?: HTMLElement,
  vertical: 'top' | 'bottom',
  text?: LangPackKey,
  textElement?: HTMLElement,
  paddingX?: number,
  centerVertically?: boolean,
  onClose?: () => void
}) => {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const mountOn = document.body;
  let close: () => void;
  createRoot((dispose) => {
    const [getRect, setRect] = createSignal<DOMRect>();

    const getStyle = (): JSX.CSSProperties => {
      const css: JSX.CSSProperties = {
        'max-width': Math.min(containerRect.width - paddingX * 2, 320) + 'px'
      };

      const rect = getRect();
      if(!rect) {
        return css;
      }

      const minX = Math.min(containerRect.left + paddingX, containerRect.right);
      const maxX = Math.max(containerRect.left, containerRect.right - Math.min(containerRect.width, rect.width) - paddingX);

      const centerX = elementRect.left + (elementRect.width - rect.width) / 2;
      const left = clamp(centerX, minX, maxX);
      const verticalOffset = 12;
      if(vertical === 'top') css.top = (centerVertically ? elementRect.top + elementRect.height / 2 : elementRect.top) - rect.height - verticalOffset + 'px';
      else css.top = elementRect.bottom + verticalOffset + 'px';
      css.left = left + 'px';

      const notchCenterX = elementRect.left + (elementRect.width - 19) / 2;
      css['--notch-offset'] = notchCenterX - left + 'px';

      return css;
    };

    let div: HTMLDivElement;
    const tooltip = (
      <div
        ref={div}
        class={classNames('tooltip', 'tooltip-' + vertical)}
        style={getStyle()}
      >
        <div class="tooltip-part tooltip-background"></div>
        <span class="tooltip-part tooltip-notch"></span>
        <div class="tooltip-part tooltip-text">{textElement}</div>
      </div>
    );

    <Portal mount={mountOn}>
      {tooltip}
    </Portal>

    onMount(() => {
      setRect(div.getBoundingClientRect());
      div.classList.add('mounted');
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        useRafs: 2,
        forwards: true
      });
    });

    let closed = false;
    const onToggle = (open: boolean) => {
      if(open) {
        return;
      }

      closed = true;
      clearTimeout(timeout);
      SetTransition({
        element: div,
        className: 'is-visible',
        duration: 200,
        forwards: false,
        onTransitionEnd: () => {
          onClose?.();
          dispose();
        }
      });
    };

    close = () => {
      if(closed) {
        return;
      }

      tooltipOverlayClickHandler.close();
    };

    const timeout = KEEP_TOOLTIP ? 0 : window.setTimeout(close, 3000);

    tooltipOverlayClickHandler.open(mountOn);
    tooltipOverlayClickHandler.addEventListener('toggle', onToggle, {once: true});
  });

  return {close};
};

const renderStoryReaction = async(props: {
  reaction: Reaction,
  uReaction: ReturnType<typeof createUnifiedSignal<JSX.Element>>,
  div: HTMLDivElement,
  size: number,
  textColor: string,
  play: boolean
}) => {
  let doc: Document.document;
  const {reaction, div, size, textColor, play, uReaction} = props;
  const isCustomEmoji = reaction._ === 'reactionCustomEmoji';
  const middleware = createMiddleware().get();
  uReaction(null);
  if(isCustomEmoji) {
    const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(reaction.document_id);
    if(!middleware()) return;
    if(!result.cached) {
      uReaction();
    }

    doc = await result.result;
  } else {
    const result = apiManagerProxy.getAvailableReactions();
    if(result instanceof Promise) {
      uReaction();
    }
    const availableReactions = await result;
    if(!middleware()) return;
    const availableReaction = availableReactions.find((availableReaction) => reactionsEqual(reaction, availableReaction));
    doc = /* availableReaction.center_icon ??  */play ? availableReaction.select_animation : availableReaction.static_icon;
  }

  const loadPromises: Promise<any>[] = [];
  await wrapSticker({
    div,
    doc,
    width: size,
    height: size,
    play,
    // isCustomEmoji,
    textColor,
    middleware,
    loadPromises,
    loop: play || undefined
  });

  await Promise.all(loadPromises);
  if(!middleware()) return;
  uReaction(div);
};

const StoryMediaArea = (props: {
  story: StoryItem.storyItem,
  mediaArea: MediaArea,
  isActive: Accessor<boolean>,
  setTooltipCloseCallback: Setter<() => void>,
  setReady: Setter<boolean>,
  sendReaction: StorySendReaction
}) => {
  const [stories, actions] = useStories();
  const {x, y, w, h, rotation} = props.mediaArea.coordinates;
  // const rotation = 10;
  // const w = 100 / stories.width * 100;
  // const h = 100 / stories.height * 100;
  const playingMemo = createMemo((prev) => prev || (props.isActive() && stories.startTime));
  const [children, setChildren] = createSignal<JSX.Element>();

  const onLocationClick = async() => {
    const geoPoint = (props.mediaArea as MediaArea.mediaAreaGeoPoint).geo as GeoPoint.geoPoint;
    const href = 'https://maps.google.com/maps?q=' + geoPoint.lat + ',' + geoPoint.long;

    const onAnchorClick = async(e: MouseEvent) => {
      if(ignoreClickEvent) {
        ignoreClickEvent = false;
        return;
      }

      hasPopup = true;
      cancelEvent(e);
      try {
        await confirmationPopup({
          descriptionLangKey: 'Popup.OpenInGoogleMaps',
          button: {
            langKey: 'Open'
          }
        });
      } catch(err) {
        if(wasPlaying) {
          actions.play();
        }

        return;
      }

      ignoreClickEvent = true;
      a.click();
    };

    let a: HTMLAnchorElement, ignoreClickEvent = false, hasPopup: boolean;
    const aa = (
      <a
        ref={a}
        href={href}
        onClick={onAnchorClick}
      >
        {i18n('StoryViewLocation')}
      </a>
    );
    setBlankToAnchor(a);
    const wasPlaying = !stories.paused;
    actions.pause();
    const {close} = showTooltip({
      element: div,
      vertical: 'top',
      textElement: a,
      centerVertically: !!rotation,
      onClose: () => {
        if(hasPopup) {
          hasPopup = false;
          return;
        }

        if(wasPlaying) {
          actions.play();
        }
      }
    });
    props.setTooltipCloseCallback(() => close);
  };

  const onReactionClick = () => {
    const mediaArea = props.mediaArea as MediaArea.mediaAreaSuggestedReaction;
    const size = stories.width * w / 100;
    const multiplier = 2.6875;
    props.sendReaction({
      reaction: mediaArea.reaction,
      target: div,
      sizes: {
        genericEffect: size * 0.375,
        genericEffectSize: size * 1.5,
        size,
        effectSize: size * multiplier
      },
      textColor: mediaArea.pFlags.dark ? 'white' : undefined,
      fireSame: true
    });
  };

  const onClick = (e: MouseEvent) => {
    if(!props.isActive()) {
      return;
    }

    cancelEvent(e);
    onTypeClick(e);
  };

  const renderReaction = (mediaArea: MediaArea.mediaAreaSuggestedReaction) => {
    const reaction = mediaArea.reaction;
    const [count, setCount] = createSignal<number>(0);
    const uReaction = createUnifiedSignal<JSX.Element>();
    const size = stories.width * w / 100 * 0.72;

    let div: HTMLDivElement;
    (<div
      ref={div}
      class={classNames(
        styles.ViewerStoryMediaAreaReactionInner,
        count() && styles.hasCount
      )}
    />);

    renderStoryReaction({
      reaction,
      uReaction,
      div,
      size,
      textColor: mediaArea.pFlags.dark ? 'white' : undefined,
      play: true
    });

    createRenderEffect(() => {
      const views = props.story.views;
      const reactions = views?.reactions;
      const reactionCount = reactions?.find((reactionCount) => reactionsEqual(reactionCount.reaction, reaction));
      setCount(reactionCount?.count ?? 0);
    });

    createEffect(() => {
      const element = uReaction();
      if(element === null) {
        return;
      }

      setChildren((
        <>
          <div
            class={classNames(
              styles.ViewerStoryMediaAreaReactionBubbles,
              mediaArea.pFlags.dark && styles.dark,
              count() && styles.hasCount
            )}
          >
            <div class={styles.ViewerStoryMediaAreaReactionBubble}></div>
            <div class={classNames(styles.ViewerStoryMediaAreaReactionBubble, styles.small)}></div>
          </div>
          {element}
          <div
            class={classNames(
              styles.ViewerStoryMediaAreaReactionCount,
              mediaArea.pFlags.dark && styles.dark,
              count() && styles.hasCount
            )}
            // style={{'font-size': size * .275 + 'px'}}
            style={{'font-size': `calc(var(--stories-width) * ${w / 100 * 0.72 * .275})`}}
          >
            {count() ? formatNumber(count(), 1) : ''}
          </div>
        </>
      ));
      props.setReady(true);
    });
  };

  let onTypeClick: (e: MouseEvent) => any;
  if(props.mediaArea._ === 'mediaAreaSuggestedReaction') {
    onTypeClick = onReactionClick;
    renderReaction(props.mediaArea);
  } else {
    onTypeClick = onLocationClick;
    props.setReady(true);
  }

  let div: HTMLDivElement;
  return (
    <div
      ref={div}
      class={classNames(
        styles.ViewerStoryMediaArea,
        ...(props.mediaArea._ !== 'mediaAreaSuggestedReaction' ? [
          playingMemo() && 'shimmer',
          'shimmer-bright',
          'shimmer-once'
        ] : []),
        ...(props.mediaArea._ === 'mediaAreaSuggestedReaction' ? [
          styles.ViewerStoryMediaAreaReaction
        ] : [])
      )}
      style={`left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%; --rotate: ${rotation}deg`}
      onClick={onClick}
    >
      {children()}
    </div>
  );
};

type StorySendReactionAnimation = {
  reaction: Reaction | Promise<Reaction>,
  target: HTMLElement,
  sizes?: Parameters<(typeof ReactionElement)['fireAroundAnimation']>[0]['sizes'],
  textColor?: string,
  fireSame?: boolean
};
type StorySendReaction = (params: StorySendReactionAnimation) => void;

const Stories = (props: {
  state: StoriesContextPeerState,
  index: Accessor<number>,
  splitByDays?: boolean,
  pinned?: boolean,
  onReady?: () => void,
  close: (callback?: () => void) => void,
  peers: StoriesContextPeerState[],
  isFull: Accessor<boolean>,
  transitionSignal: Signal<boolean>
}) => {
  const avatar = AvatarNew({
    size: STORY_HEADER_AVATAR_SIZE,
    peerId: props.state.peerId,
    isDialog: false
  });
  avatar.node.classList.add(styles.ViewerStoryHeaderAvatar);
  const isMe = rootScope.myId === props.state.peerId;
  const peerTitle = !isMe && new PeerTitle();
  let peerTitleElement: HTMLElement;
  if(peerTitle) {
    peerTitle.update({peerId: props.state.peerId, dialog: false});
    peerTitleElement = peerTitle.element;
  } else {
    peerTitleElement = i18n('YourStory');
  }

  peerTitleElement.classList.add(styles.ViewerStoryHeaderName);

  const bindOnAnyPopupClose = (wasPlaying = !stories.paused) => () => onAnyPopupClose(wasPlaying);
  const onAnyPopupClose = (wasPlaying: boolean) => {
    if(wasPlaying) {
      actions.play();
    }
  };

  const onShareClick = (wasPlaying = !stories.paused) => {
    actions.pause();
    const popup = PopupPickUser.createSharingPicker(async(peerId) => {
      const storyPeerId = props.state.peerId;
      const inputPeer = await rootScope.managers.appPeersManager.getInputPeerById(storyPeerId);
      rootScope.managers.appMessagesManager.sendOther(
        peerId,
        {
          _: 'inputMediaStory',
          id: currentStory().id,
          peer: inputPeer
        }
      );

      showMessageSentTooltip(
        i18n(
          peerId === rootScope.myId ? 'StorySharedToSavedMessages' : 'StorySharedTo',
          [await wrapPeerTitle({peerId})]
        )
      );
    }, ['send_media']);

    popup.addEventListener('closeAfterTimeout', bindOnAnyPopupClose(wasPlaying));
  };

  const onShareButtonClick = (e: MouseEvent, listenTo: HTMLElement) => {
    const story = currentStory() as StoryItem.storyItem;
    if(story.pFlags.noforwards) {
      const {open} = createContextMenu({
        buttons: [{
          icon: 'link',
          text: 'CopyLink',
          onClick: copyLink
        }],
        listenTo: listenTo,
        ...topMenuOptions
      });
      open(e);
    } else {
      onShareClick();
    }
  };

  const avatarInfo = AvatarNew({
    size: 162/* 54 */,
    peerId: props.state.peerId,
    isDialog: false,
    withStories: true,
    storyColors: {
      read: 'rgba(255, 255, 255, .3)'
    }
  });
  avatarInfo.node.classList.add(styles.ViewerStoryInfoAvatar);
  let peerTitleInfoElement: HTMLElement;
  if(isMe) {
    peerTitleInfoElement = i18n('MyStory');
  } else {
    const peerTitleInfo = new PeerTitle();
    peerTitleInfo.update({peerId: props.state.peerId, dialog: false, onlyFirstName: true});
    peerTitleInfoElement = peerTitleInfo.element;
  }
  peerTitleInfoElement.classList.add(styles.ViewerStoryInfoName);

  const [stories, actions] = useStories();
  const [content, setContent] = createSignal<JSX.Element>();
  const [videoDuration, setVideoDuration] = createSignal<number>();
  const [caption, setCaption] = createSignal<JSX.Element>();
  const [reaction, setReaction] = createSignal<JSX.Element>();
  const [captionOpacity, setCaptionOpacity] = createSignal(0);
  const [captionActive, setCaptionActive] = createSignal(false);
  const [date, setDate] = createSignal<{timestamp: number, edited?: boolean}>();
  const [loading, setLoading] = createSignal(false);
  const focusedSignal = createSignal(false);
  const sendingReactionSignal = createSignal<StorySendReactionAnimation>();
  const inputEmptySignal = createSignal(true);
  const inputMenuOpenSignal = createSignal(false);
  const isPublicSignal = createSignal(false);
  const [focused, setFocused] = focusedSignal;
  const [sendingReaction, setSendingReaction] = sendingReactionSignal;
  const [inputEmpty] = inputEmptySignal;
  const [inputMenuOpen] = inputMenuOpenSignal;
  const [isPublic, setIsPublic] = isPublicSignal;
  const [noSound, setNoSound] = createSignal(false);
  const [sliding, setSliding] = props.transitionSignal;
  const [privacyType, setPrivacyType] = createSignal<StoryPrivacyType>();
  const [mediaAreas, setMediaAreas] = createSignal<JSX.Element>();
  const [stackedAvatars, setStackedAvatars] = createSignal<StackedAvatars>();
  const [tooltipCloseCallback, setTooltipCloseCallback] = createSignal<VoidFunction>();
  const [reactionsMenu, setReactionsMenu] = createSignal<ChatReactionsMenu>();
  const currentStory = createMemo(() => props.state.stories[props.state.index]);
  const isExpired = createMemo(() => {
    const story = currentStory();
    const expireDate = (story as StoryItem.storyItem).expire_date;
    if(!expireDate) return false;
    return expireDate <= tsNow(true);
  });
  const isActive = createMemo(() => stories.peer === props.state);
  const [forceReaction, setForceReaction] = createSignal(false, {equals: false});

  let currentStoryMiddleware: Middleware;
  createEffect(() => {
    currentStory();
    currentStoryMiddleware = createMiddleware().get();
  });

  const fireReactionAnimation = (reaction: Reaction, params = untrack(() => sendingReaction())) => {
    if(!params || params.target === storyDiv) {
      return;
    }

    const sizes = params.sizes ?? {
      genericEffect: 26,
      genericEffectSize: 100,
      size: 22 + 18,
      effectSize: 80
    };

    ReactionElement.fireAroundAnimation({
      middleware: params.fireSame ? currentStoryMiddleware : createMiddleware().get(),
      reaction,
      sizes,
      stickerContainer: params.target,
      cache: params.fireSame ? {} : params.target as any,
      textColor: params.textColor
    });
  };

  createEffect(() => {
    const reaction = (currentStory() as StoryItem.storyItem).sent_reaction;
    if(!reaction) {
      return;
    }

    // ! DO NOT REMOVE ! it handles update, since I don't observe any property in reaction
    (reaction as Reaction.reactionCustomEmoji)?.document_id;
    forceReaction();
    fireReactionAnimation(reaction);
  });

  const sendReaction: StorySendReaction = async(params) => {
    let {reaction} = params;
    const peerId = props.state.peerId;
    const story = currentStory() as StoryItem.storyItem;
    const storyId = story.id;
    const sentReaction = story.sent_reaction;

    // * wait for picker
    if(reaction instanceof Promise) {
      reaction = await reaction;
      if(!reaction) {
        return;
      }
    }

    const isNewReaction = !reactionsEqual(sentReaction, reaction);
    if(!isNewReaction && !params.fireSame) {
      reaction = undefined;
    }

    setFocused(false);
    setSendingReaction(params);

    if(!isNewReaction && params.fireSame) {
      setForceReaction(true);
    }

    await rootScope.managers.acknowledged.appStoriesManager.sendReaction(
      peerId,
      storyId,
      unwrap(reaction as Reaction)
    );
    setSendingReaction();
  };

  const createReactionsMenu = () => {
    const [inited, setInited] = createSignal(false);
    const middleware = createMiddleware().get();
    const menu = new ChatReactionsMenu({
      managers: rootScope.managers,
      type: 'horizontal',
      middleware,
      onFinish: (reaction) => sendReaction({reaction, target: storyDiv}),
      size: 36,
      openSide: 'top',
      getOpenPosition: () => undefined,
      noMoreButton: true
    });

    menu.widthContainer.classList.add(styles.ViewerStoryReactions);

    menu.init().finally(() => {
      setInited(true);
    });

    let timeout: number;
    createEffect(() => {
      if(!inited()) {
        return;
      }

      const isVisible = shouldMenuBeVisible();
      menu.widthContainer.classList.toggle('is-visible', isVisible);

      if(!isVisible) {
        timeout = window.setTimeout(() => {
          setReactionsMenu();
          menu.cleanup();
        }, liteMode.isAvailable('animations') ? 200 : 0);
      } else {
        clearTimeout(timeout);
      }
    });

    setReactionsMenu(menu);
  };

  const shouldMenuBeVisible = () => focused() && inputEmpty() && !inputMenuOpen();
  const haveToCreateMenu = createMemo(() => {
    return reactionsMenu() ? true : shouldMenuBeVisible();
  });

  createEffect(() => {
    if(haveToCreateMenu()) {
      createReactionsMenu();
    }
  });

  const setVideoListeners = (video: HTMLVideoElement) => {
    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
      video.pause();
      // video.src = '';
      // video.load();
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
    });

    const onCanPlay = () => {
      setLoading(false);
      if(isActive()) {
        actions.setBuffering(false);
      }
    };

    const onWaiting = () => {
      const loading = video.networkState === video.NETWORK_LOADING;
      const isntEnoughData = video.readyState < video.HAVE_FUTURE_DATA;

      if(loading && isntEnoughData) {
        setLoading(true);
        if(isActive()) {
          actions.setBuffering(true);
        }
        video.addEventListener('canplay', onCanPlay, {once: true});
      }
    };

    const reset = () => {
      if(!video.currentTime) {
        return;
      }

      setCurrentTime(video, 0);
    };

    video.addEventListener('waiting', onWaiting);

    onCleanup(() => {
      if(stories.buffering) {
        actions.setBuffering(false);
      }
    });

    // pause the video on viewer pause or story change
    createEffect(() => {
      if(stories.paused || !isActive()) {
        video.pause();
      } else {
        video.play();
      }
    });

    const onFirstActive = () => {
      // seek to start on story change
      createEffect(on(
        () => [/* props.state.index,  */isActive()],
        ([/* index,  */isActive]) => {
          if(isActive) {
            return;
          }

          reset();
        }
      ));

      createEffect(() => {
        video.muted = stories.muted;
      });
    };

    if(isActive()) {
      onFirstActive();
    } else {
      createReaction(onFirstActive)(() => isActive());
    }

    const story = untrack(() => currentStory());
    createEffect(() => {
      if(isActive() && !stories.startTime && currentStory() === story) {
        reset();
      }
    });

    apiManagerProxy.getState().then((state) => {
      if(!cleaned && !state.seenTooltips.storySound) {
        runWithOwner(owner, () => {
          const playingMemo = createMemo((prev) => prev || (isActive() && stories.startTime));
          createEffect(() => {
            if(playingMemo()) {
              const {close} = showTooltip({
                ...muteTooltipOptions,
                textElement: i18n('Story.SoundTooltip')
              });
              setTooltipCloseCallback(() => close);
            }
          });
        });

        rootScope.managers.appStateManager.setByKey(joinDeepPath('seenTooltips', 'storySound'), true);
      }
    });

    const owner = getOwner();
  };

  const setStoryMeta = (story: StoryItem.storyItemSkipped | StoryItem.storyItem) => {
    let privacyType = getStoryPrivacyType(story as StoryItem.storyItem);
    if(/* !isMe &&  */privacyType === 'public') {
      privacyType = undefined;
    }

    const messageMedia = unwrap((story as StoryItem.storyItem).media);
    const document = (messageMedia as MessageMedia.messageMediaDocument)?.document as Document.document;
    const videoAttribute = document && document.attributes.find((attribute) => attribute._ === 'documentAttributeVideo') as DocumentAttribute.documentAttributeVideo;
    const noSound = videoAttribute ? !!videoAttribute.pFlags.nosound : false;
    const videoDuration = videoAttribute?.duration;
    const date = story.date;
    const edited = (story as StoryItem.storyItem).pFlags.edited;
    const isPublic = !!(story as StoryItem.storyItem).pFlags.public;

    setPrivacyType(privacyType);
    setDate({timestamp: date, edited});
    setNoSound(noSound);
    setVideoDuration(videoDuration && (videoDuration * 1000));
    setIsPublic(isPublic);
    // shareButton.classList.toggle('hide', !isPublic);
  };

  const setStory = async(story: StoryItem) => {
    setLoading(true);
    if(story._ !== 'storyItem') {
      setStackedAvatars();
      setContent();
      setCaption();
      setReaction();
      setMediaAreas();
      setStoryMeta(story as StoryItem.storyItemSkipped);
      rootScope.managers.appStoriesManager.getStoryById(props.state.peerId, story.id);
      props.onReady?.();
      return;
    }

    const middleware = createMiddleware().get();
    const uStackedAvatars = isMe ? createUnifiedSignal<StackedAvatars>() : undefined;
    const uCaption = createUnifiedSignal<JSX.Element>();
    const uContent = createUnifiedSignal<JSX.Element>();
    const uReaction = createUnifiedSignal<JSX.Element>();
    const uMediaAreas = createUnifiedSignal<JSX.Element>();
    const recentViewersMemo = isMe ? createMemo<UserId[]>((previousRecentViewers) => {
      const views = story.views;
      const recentViewers = views?.recent_viewers;
      if(previousRecentViewers?.join() === recentViewers?.join()) {
        return previousRecentViewers;
      }
      return recentViewers;
    }) : undefined;

    isMe && createEffect(async() => {
      let stackedAvatars: StackedAvatars;
      const recentViewers = recentViewersMemo();
      if(recentViewers?.length) {
        stackedAvatars = new StackedAvatars({
          avatarSize: 30,
          middleware
        });

        const peerIds = recentViewers.map((userId) => {
          return userId.toPeerId(false);
        });

        uStackedAvatars(null);
        await stackedAvatars.render(peerIds);
        if(!middleware()) {
          return;
        }
      }

      uStackedAvatars(stackedAvatars);
    });

    createEffect(async() => {
      let captionNode: JSX.Element;
      const {caption, entities} = story;
      if(caption?.trim()) {
        const loadPromises: Promise<any>[] = [];
        const {message, totalEntities} = wrapMessageEntities(caption, entities?.slice());
        const wrapped = wrapRichText(message, {
          entities: totalEntities,
          middleware,
          textColor: 'white',
          loadPromises
        });

        uCaption(null);
        await Promise.all(loadPromises);
        if(!middleware()) {
          return;
        }

        captionNode = documentFragmentToNodes(wrapped);
      }

      uCaption(captionNode);
    });

    createEffect(() => {
      const media = untrack(() => getMediaFromMessage(story));
      const mediaId = media.id;
      if(!mediaId) {
        uContent();
        return;
      }

      uContent(null);

      const wrapped = wrapStoryMedia({
        peerId: props.state.peerId,
        storyItem: unwrap(story),
        forViewer: true,
        containerProps: {
          class: styles.ViewerStoryContentMediaContainer
        },
        childrenClassName: styles.ViewerStoryContentMedia,
        useBlur: 40
      });

      const onReady = () => {
        uContent(wrapped.container);
      };

      const onLoad = () => {
        if(!middleware()) {
          return;
        }

        setLoading(false);
        untrack(() => playOnOpen());
        // props.onReady?.();
      };

      const onMedia = () => {
        const media = wrapped.media();

        if(media instanceof HTMLVideoElement) {
          setVideoListeners(media);
          onMediaLoad(media).then(onLoad);
        } else {
          onLoad();
        }
      };

      createReaction(onReady)(() => wrapped.ready());
      createReaction(onMedia)(() => wrapped.media());
    });

    createEffect(async() => {
      let reactionNode: JSX.Element;
      const sentReaction = story.sent_reaction;
      const isDefault = isDefaultReaction(sentReaction);
      if(!sentReaction || isDefault) {
        reactionNode = Icon('reactions_filled', ...['btn-reaction-icon', isDefault && 'btn-reaction-default'].filter(Boolean));
        uReaction(reactionNode);
      } else {
        const div = document.createElement('div');
        div.classList.add('btn-reaction-sticker', 'night');
        renderStoryReaction({
          reaction: sentReaction,
          uReaction,
          div,
          size: 26,
          textColor: 'white',
          play: false
        });
      }
    });

    createEffect(() => {
      if(!(story as StoryItem.storyItem).media_areas) {
        uMediaAreas();
        return;
      }

      uMediaAreas(null);

      const [allReady, setAllReady] = createSignal(false);
      const [readyCount, setReadyCount] = createSignal(0);
      const mediaAreas = (
        <For each={(story as StoryItem.storyItem).media_areas}>
          {(mediaArea) => {
            const [ready, setReady] = createSignal(false);

            createReaction(() => {
              console.log('mediaArea ready');
              setReadyCount((count) => count + 1);
              if(readyCount() === (story as StoryItem.storyItem).media_areas.length) {
                setAllReady(true);
              }
            })(ready);

            return (
              <StoryMediaArea
                story={story}
                mediaArea={mediaArea}
                isActive={isActive}
                setTooltipCloseCallback={setTooltipCloseCallback}
                setReady={setReady}
                sendReaction={sendReaction}
              />
            );
          }}
        </For>
      );

      createReaction(() => {
        console.log('mediaAreas ready');
        uMediaAreas(mediaAreas);
      })(allReady);
    });

    createEffect(
      on(
        () => [inputReady(), uStackedAvatars?.(), uCaption(), uContent(), uReaction?.(), uMediaAreas()] as const,
        ([inputReady, ...u]) => {
          if(!inputReady || u.some((v) => v === null)) {
            return;
          }

          const [stackedAvatars, caption, content, reaction, mediaAreas] = u;
          setStackedAvatars(stackedAvatars);
          setCaption(caption);
          setContent(content);
          setReaction(reaction);
          setMediaAreas(mediaAreas);
          props.onReady?.();

          createEffect(() => {
            setStoryMeta(story);
          });
        },
        {defer: true}
      )
    );
  };

  createEffect(() => { // on story change
    const story = currentStory();
    setCaptionOpacity(0);
    setCaptionActive(false);

    createEffect(() => {
      setStory(story);
    });
    // createEffect(on( // on story update
    //   () => story._,
    //   () => {
    //     setStory(unwrap(story), hasViewer);
    //   }
    // ));
  });

  const pollViewedStories = () => {
    if(!pollViewedStoriesSet.size) {
      return;
    }

    const ids = Array.from(pollViewedStoriesSet);
    pollViewedStoriesSet.clear();
    rootScope.managers.appStoriesManager.getStoriesById(props.state.peerId, ids, true);
  };
  const pollViewedStoriesSet: Set<number> = new Set();
  let pollViewedStoriesInterval: number;
  createEffect(() => {
    if(isActive()) {
      pollViewedStoriesInterval = window.setInterval(pollViewedStories, 60e3);

      createEffect(() => {
        pollViewedStoriesSet.add(currentStory().id);
      });
    } else {
      clearInterval(pollViewedStoriesInterval);
    }
  });

  const readStories = (maxId: number) => {
    if(viewedStories.size) {
      rootScope.managers.appStoriesManager.incrementStoryViews(props.state.peerId, Array.from(viewedStories));
      viewedStories.clear();
    }

    rootScope.managers.appStoriesManager.readStories(props.state.peerId, maxId);
  };

  const viewedStories: Set<number> = new Set();
  const readDebounced = debounce(readStories, 5e3, true, true);
  createEffect(() => { // read stories
    if(!isActive()) {
      return;
    }

    let lastId: number;
    createEffect(() => {
      const story = currentStory();
      if(props.pinned && untrack(() => isExpired())) viewedStories.add(story.id);
      readDebounced(lastId = story.id);
    });

    onCleanup(() => {
      if(!readDebounced.isDebounced()) {
        return;
      }

      readDebounced.clearTimeout();
      readStories(lastId);
    });
  });

  const playOnOpen = () => {
    if(!stories.hasViewer || untrack(() => !isActive())) {
      return;
    }

    playOnReady();
  };

  createEffect(playOnOpen); // play on open

  const slides = <StorySlides {...mergeProps(props, {currentStory})} />;

  let shouldAddTranslateX = true;
  const calculateTranslateX = () => {
    let diff = diffToActive();
    if(!diff) {
      return '0px';
    }

    if(
      shouldShow() &&
      stories.hasViewer &&
      fadeIn() &&
      shouldAddTranslateX
    ) {
      if(diff > 0) ++diff;
      else --diff;
    }

    const storyWidth = stories.width;
    const MARGIN = 40;
    const multiplier = diff > 0 ? 1 : -1;
    const smallStoryWidth = storyWidth * STORY_SCALE_SMALL;
    let offset = storyWidth * multiplier;
    const distance = (storyWidth - smallStoryWidth) / 2 - MARGIN;
    offset = (storyWidth - distance) * multiplier;
    if(Math.abs(diff) !== 1) {
      const d = diff - 1 * multiplier;
      offset += d * smallStoryWidth + MARGIN * d;
    }
    return offset + 'px';
  };

  const playOnReady = () => {
    if(untrack(() => loading())) {
      return;
    }

    const activeVideoDuration = untrack(() => videoDuration());
    // * add 0.001 just to differ video and photo stories
    const storyDuration = activeVideoDuration ? activeVideoDuration + 0.001 : STORY_DURATION;
    actions.play(storyDuration);
  };

  // let transitionPromise: CancellablePromise<void>;
  const onTransitionStart = (e?: TransitionEvent) => {
    if(e && e.target !== div) {
      return;
    }

    setSliding(true);
    // transitionPromise = deferredPromise();
  };

  const onTransitionEnd = (e?: TransitionEvent) => {
    if(e && e.target !== div) {
      return;
    }

    shouldAddTranslateX = true;
    setSliding(false);
    // transitionPromise?.resolve();
    if(!isActive()) {
      return;
    }

    playOnReady();
  };

  const toggleMute = (e: MouseEvent) => {
    if(noSound()) {
      const {close} = showTooltip({
        ...muteTooltipOptions,
        textElement: i18n('Story.NoSound')
      });
      setTooltipCloseCallback(() => close);
      return;
    }

    actions.toggleMute();
  };

  let muteButtonButton: HTMLButtonElement;
  const muteButton = (
    <ButtonIconTsx
      ref={muteButtonButton}
      classList={{[styles.noSound]: noSound()}}
      icon={stories.muted || noSound() ? 'speakerofffilled' : 'speakerfilled'}
      onClick={toggleMute}
    />
  );

  const copyLink = () => {
    copyTextToClipboard(`https://t.me/${getPeerActiveUsernames(peer)[0]}/s/${currentStory().id}`);
    toastNew({
      langPackKey: 'LinkCopied'
    });
  };

  const topMenuOptions: Partial<Parameters<typeof createContextMenu>[0]> = {
    onOpenBefore: async() => {
      peer = await rootScope.managers.appStoriesManager.getPeer(props.state.peerId);
      story = currentStory() as StoryItem.storyItem;
      peerId = props.state.peerId;
    },
    onOpen: () => {
      wasPlaying = !stories.paused;
      actions.pause();
    },
    onCloseAfter: () => {
      if(wasPlaying && !ignoreOnClose) {
        actions.play();
      }

      ignoreOnClose = false;
    }
  };

  // * caption start

  const CAPTION_ACTIVE_THRESHOLD = 0.2;
  createEffect(() => {
    if(!isActive()) {
      return;
    }

    actions.setLoop(videoDuration() !== undefined && captionActive());
  });

  let wasPlayingBeforeCaption: boolean;
  const onCaptionScrollTop = (scrollTop: number) => {
    const progress = Math.min(1, scrollTop / 100);
    const active = progress >= CAPTION_ACTIVE_THRESHOLD;
    setCaptionOpacity(progress);
    setCaptionActive(active);
    // console.log('caption progress', progress);

    if(videoDuration() !== undefined) {
      return;
    }

    if(active) {
      if(wasPlayingBeforeCaption === undefined) {
        wasPlayingBeforeCaption = !stories.paused;
        actions.pause();
      }
    } else if(wasPlayingBeforeCaption) {
      wasPlayingBeforeCaption = undefined;
      actions.play();
    }
  };

  let captionScrollable: HTMLDivElement, captionText: HTMLDivElement, scrolling = false;
  const onCaptionScroll = () => {
    if(scrolling) {
      return;
    }

    const scrollTop = captionScrollable.scrollTop;
    onCaptionScrollTop(scrollTop);
  };

  const scrollPath = (path: number) => {
    const target = Math.max(0, path);
    const startTime = Date.now();
    scrolling = true;

    const story = currentStory();
    animateSingle(() => {
      if(currentStory() !== story) {
        return false;
      }

      const t = Math.min(1, (Date.now() - startTime) / 300);
      const value = easeOutCubicApply(t, 1);
      const currentPath = path * (1 - value);
      const scrollTop = Math.round(target - currentPath);
      captionScrollable.scrollTop = scrollTop;
      onCaptionScrollTop(scrollTop);

      return t < 1;
    }, captionScrollable).finally(() => {
      scrolling = false;
    });
  };

  const onCaptionClick = (e: MouseEvent) => {
    if((captionScrollable.scrollHeight <= captionScrollable.clientHeight) || captionScrollable.scrollTop) {
      return;
    }

    cancelEvent(e);
    const visibleTextHeight = captionScrollable.clientHeight - captionScrollable.clientWidth * 0.7 - 8;
    const path = Math.min(captionText.scrollHeight - visibleTextHeight, captionScrollable.clientHeight - 60);
    scrollPath(path);
  };

  const captionContainer = (
    <div
      ref={captionScrollable}
      class={classNames('scrollable', 'scrollable-y', 'no-scrollbar', styles.ViewerStoryCaption)}
      onScroll={onCaptionScroll}
    >
      <div
        ref={captionText}
        class={classNames('spoilers-container', styles.ViewerStoryCaptionText)}
        onClick={onCaptionClick}
      >
        <div class={styles.ViewerStoryCaptionTextCell} dir="auto">
          {caption()}
        </div>
      </div>
    </div>
  );

  // * caption end

  const contentItem = (
    <div
      class={styles.ViewerStoryContentItem}
      style={captionOpacity() && {opacity: 1 - captionOpacity() * 0.5}}
    >
      {content()}
      {mediaAreas()}
    </div>
  );

  const getDateText = () => {
    const {timestamp, edited} = date() || {};
    if(!timestamp) {
      return;
    }

    const elapsedTime = tsNow(true) - timestamp;
    const formatted = formatDuration(elapsedTime);
    const map: {[type in DurationType]?: LangPackKey} = {
      [DurationType.Seconds]: 'StoryJustNow',
      [DurationType.Minutes]: 'MinutesShortAgo',
      [DurationType.Hours]: 'HoursShortAgo'
      // [DurationType.Days]: 'DaysShortAgo'
    };

    // if(formatted[0].type === DurationType.Seconds) {
    //   formatted[0] = {
    //     type: DurationType.Minutes,
    //     duration: 0
    //   };
    // }

    const first = formatted[0];
    const key = map[first.type];
    const elements: (Node | string | (Node | string)[])[] = [];
    if(!key) {
      // return formatFullSentTime(timestamp);
      // elements.push(getFullDate(new Date(timestamp * 1000), {shortYear: true}));
      elements.push(<span>{documentFragmentToNodes(formatFullSentTime(timestamp))}</span> as any);
    } else if(first.type === DurationType.Days && first.duration !== 1) {
      elements.push(formatDateAccordingToTodayNew(new Date(timestamp * 1000)));
    } else {
      elements.push(i18n(key, [first.duration]));
    }

    if(edited) {
      elements.push(i18n('EditedMessage'));
    }

    return joinElementsWith(elements, JOINER);
  };

  const showMessageSentTooltip = (textElement: HTMLElement, peerId?: PeerId) => {
    let a: HTMLAnchorElement;
    if(peerId) {
      a = document.createElement('a');
      a.href = '#';
      a.addEventListener('click', (e) => {
        cancelEvent(e);
        props.close(() => {
          appImManager.setInnerPeer({peerId});
        });
      }, {capture: true, passive: false});
      a.append(i18n('ViewInChat'));
    }

    setQuizHint({
      textElement,
      textRight: a,
      appendTo: storyDiv,
      from: 'bottom',
      duration: 3000,
      icon: 'checkround_filled'
    });
  };

  const needStoryInput = props.state.peerId !== CHANGELOG_PEER_ID &&
    props.state.peerId !== rootScope.myId &&
    props.state.peerId.isUser();
  const [inputReady, setInputReady] = createSignal(!needStoryInput);
  const storyInput = needStoryInput &&
    <StoryInput
      {
        ...mergeProps(props, {
          currentStory,
          isActive,
          focusedSignal,
          inputEmptySignal,
          inputMenuOpenSignal,
          sendReaction,
          isPublic,
          shareStory: onShareClick,
          reaction,
          onShareButtonClick,
          onMessageSent: () => {
            showMessageSentTooltip(i18n('Story.Tooltip.MessageSent'), props.state.peerId);
          },
          setInputReady
        })
      }
    />;

  // * top menu start

  const isPeerArchived = async(visible: boolean) => {
    const peerId = props.state.peerId;
    if(peerId === rootScope.myId || peerId === CHANGELOG_PEER_ID) {
      return false;
    }

    const [peer, isSubscribed] = await Promise.all([
      rootScope.managers.appStoriesManager.getPeer(peerId),
      rootScope.managers.appStoriesManager.isSubcribedToPeer(peerId)
    ]);
    const isHidden = !!peer.pFlags.stories_hidden;
    return (visible ? !isHidden : isHidden) && isSubscribed;
  };

  const togglePeerHidden = async(hidden: boolean) => {
    const peerId = props.state.peerId;
    rootScope.managers.appStoriesManager.toggleStoriesHidden(peerId, hidden);
    toastNew({
      langPackKey: hidden ? 'StoriesMovedToContacts' : 'StoriesMovedToDialogs',
      langPackArguments: [await wrapPeerTitle({peerId})]
    });
  };

  const togglePinned = async(pinned: boolean) => {
    const peerId = props.state.peerId;
    rootScope.managers.appStoriesManager.togglePinned(peerId, currentStory().id, pinned).then(() => {
      toastNew({
        langPackKey: pinned ?
          (peerId.isUser() ? 'StoryPinnedToProfile' : 'StoryPinnedToPosts') :
          (peerId.isUser() ? 'StoryArchivedFromProfile' : 'StoryUnpinnedFromPosts')
      });
    });
  };

  let wasPlaying = false,
    peer: User.user | MTChat.channel,
    peerId: PeerId,
    story: StoryItem.storyItem | StoryItem.storyItemSkipped,
    ignoreOnClose = false;
  const btnMenu = ButtonMenuToggle({
    buttons: [{
      icon: 'plusround',
      text: 'Story.AddToProfile',
      onClick: () => togglePinned(true),
      verify: () => peerId === rootScope.myId && !(story as StoryItem.storyItem).pFlags?.pinned
    }, {
      icon: 'crossround',
      text: 'Story.RemoveFromProfile',
      onClick: () => togglePinned(false),
      verify: () => peerId === rootScope.myId && !!(story as StoryItem.storyItem).pFlags?.pinned
    }, {
      icon: 'plusround',
      text: 'SaveToPosts',
      onClick: () => togglePinned(true),
      verify: () => !peerId.isUser() && !(story as StoryItem.storyItem).pFlags?.pinned && rootScope.managers.appStoriesManager.hasRights(peerId, story.id, 'pin')
    }, {
      icon: 'crossround',
      text: 'RemoveFromPosts',
      onClick: () => togglePinned(false),
      verify: () => !peerId.isUser() && !!(story as StoryItem.storyItem).pFlags?.pinned && rootScope.managers.appStoriesManager.hasRights(peerId, story.id, 'pin')
    }, {
      icon: 'forward',
      text: 'ShareFile',
      onClick: () => {
        ignoreOnClose = true;
        onShareClick(wasPlaying);
      },
      verify: () => {
        return !!(story as StoryItem.storyItem)?.pFlags?.public && !(story as StoryItem.storyItem).pFlags.noforwards;
      }
    }, {
      icon: 'link',
      text: 'CopyLink',
      onClick: copyLink,
      verify: () => {
        if(story._ !== 'storyItem') {
          return false;
        }

        // const appConfig = await rootScope.managers.apiManager.getAppConfig();
        return (story.pFlags.public/*  || appConfig.stories_export_nopublic_link */) && !!getPeerActiveUsernames(peer)[0];
      }
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => {
        const story = currentStory();
        const media = getMediaFromMessage(story as StoryItem.storyItem, true);
        if(!media) {
          return;
        }
        appDownloadManager.downloadToDisc({media: unwrap(media)});
      },
      verify: () => {
        if(props.state.peerId === rootScope.myId) {
          return true;
        }

        const story = currentStory();
        return !!(story?._ === 'storyItem' && !story.pFlags.noforwards && rootScope.premium);
      }
    }, {
      icon: 'archive',
      text: 'ArchivePeerStories',
      onClick: () => togglePeerHidden(true),
      verify: () => isPeerArchived(true)
    }, {
      icon: 'unarchive',
      text: 'UnarchiveStories',
      onClick: () => togglePeerHidden(false),
      verify: () => isPeerArchived(false)
    }, {
      icon: 'delete danger' as Icon,
      text: 'Delete',
      onClick: async() => {
        const id = currentStory().id;
        const peerId = props.state.peerId;
        ignoreOnClose = true;
        const onAnyPopupClose = bindOnAnyPopupClose(wasPlaying);
        try {
          await confirmationPopup({
            titleLangKey: 'DeleteStoryTitle',
            descriptionLangKey: 'DeleteStorySubtitle',
            button: {
              langKey: 'Delete',
              isDanger: true
            }
          });
        } catch(err) {
          onAnyPopupClose();
          return;
        }

        rootScope.managers.appStoriesManager.deleteStories(peerId, [id]);
      },
      verify: () => rootScope.managers.appStoriesManager.hasRights(peerId, story.id, 'delete')
    }, {
      icon: 'flag',
      className: 'danger',
      text: 'ReportChat',
      onClick: () => {
        ignoreOnClose = true;
        const onAnyPopupClose = bindOnAnyPopupClose(wasPlaying);
        PopupElement.createPopup(
          PopupReportMessages,
          props.state.peerId,
          [currentStory().id],
          onAnyPopupClose,
          true
        );
      },
      verify: () => !(story as StoryItem.storyItem).pFlags?.out && props.state.peerId !== CHANGELOG_PEER_ID
      // separator: true
    }],
    direction: 'bottom-left',
    ...topMenuOptions
  });
  btnMenu.classList.add('night');

  // * top menu end

  // * privacy icon start

  const privacyIconMap: {[key in StoryPrivacyType]: Icon} = {
    close: 'star_filled',
    contacts: 'newprivate_filled',
    public: 'newchannel_filled',
    selected: 'newgroup_filled'
  };

  const onPrivacyIconClick = async() => {
    const type = privacyType();
    const peerTitle = await wrapPeerTitle({peerId: props.state.peerId, onlyFirstName: true});
    const {close} = showTooltip({
      container: headerDiv,
      element: privacyIconElement,
      vertical: 'bottom',
      textElement: i18n(
        type === 'close' ? 'StoryCloseFriendsHint' : (type === 'selected' ? 'StorySelectedContactsHint' : 'StoryContactsHint'),
        [peerTitle]
      ),
      paddingX: 13
    });

    setTooltipCloseCallback(() => close);
  };

  createEffect(() => {
    const close = tooltipCloseCallback();
    if(!close) {
      return;
    }

    onCleanup(close);

    createEffect(
      on(
        () => [isActive(), currentStory()],
        () => {
          close();
          setTooltipCloseCallback();
        },
        {defer: true}
      )
    );
  });

  let privacyIconElement: HTMLDivElement;
  const privacyIcon = (
    <div
      ref={privacyIconElement}
      class={classNames(
        styles.ViewerStoryPrivacy,
        'privacy-bg',
        `privacy-bg-${privacyType()}`
      )}
      onClick={() => onPrivacyIconClick()}
    >
      {Icon(privacyIconMap[privacyType()])}
    </div>
  );

  // * privacy icon end

  // * my footer start

  const getViews = isMe && (() => {
    const story = currentStory();
    if(story._ !== 'storyItem') {
      return;
    }

    const viewsCount = story.views?.views_count ?? 0;
    if(!viewsCount) {
      const isExpired = story.expire_date <= tsNow(true);
      if(isExpired) {
        return i18n('NobodyViewsArchived');
      } else {
        return i18n('NobodyViews');
      }
    } else {
      return i18n('Views', [viewsCount]);
    }
  });

  const openViewsList = isMe && (() => {
    let nextOffset: string;
    const viewsMap: Map<PeerId, StoryView> = new Map();
    const popup: PopupPickUser = PopupElement.createPopup(
      PopupPickUser,
      {
        peerType: ['custom'],
        getMoreCustom: (q) => {
          const loadCount = 50;
          return rootScope.managers.appStoriesManager.getStoryViewsList(
            props.state.peerId,
            currentStory().id,
            loadCount,
            nextOffset,
            q
          ).then(({count, nextOffset: _nextOffset, views}) => {
            nextOffset = _nextOffset;
            return {
              result: views.map((storyView) => {
                const peerId = storyView.user_id.toPeerId(false);
                viewsMap.set(peerId, storyView);
                return peerId;
              }),
              isEnd: !nextOffset
            };
          });
        },
        processElementAfter: (peerId, dialogElement) => {
          const view = viewsMap.get(peerId);
          return processDialogElementForReaction({
            dialogElement,
            peerId,
            date: view.date,
            isMine: true,
            middleware: popup.selector.middlewareHelperLoader.get(),
            reaction: view.reaction
          });
        },
        onSelect: (peerId) => {
          props.close(() => {
            appImManager.setInnerPeer({peerId});
          });
        },
        placeholder: 'SearchPlaceholder',
        exceptSelf: true,
        meAsSaved: false
      }
    );
  });

  const onDeleteClick = isMe && (async() => {
    const peerId = props.state.peerId;
    const storyId = currentStory().id;
    await confirmationPopup({
      titleLangKey: 'DeleteStoryTitle',
      descriptionLangKey: 'DeleteStorySubtitle',
      button: {
        isDanger: true,
        langKey: 'Delete'
      }
    });

    rootScope.managers.appStoriesManager.deleteStories(peerId, [storyId]);
  });

  if(isMe) {
    const viewedStories: Set<number> = new Set();
    const getAround = 2;
    let promise: Promise<any>;
    const getStoriesViews = async() => {
      if(promise) {
        return;
      }

      const story = currentStory();
      const index = props.state.stories.indexOf(story);
      const slice = props.state.stories.slice(Math.max(0, index - getAround), index + getAround);
      slice.forEach((story) => {
        viewedStories.add(story.id);
      });

      const ids = Array.from(viewedStories);
      viewedStories.clear();
      promise = rootScope.managers.appStoriesManager.getStoriesViews(props.state.peerId, ids).then(() => {
        promise = undefined;
      });

      // let's clear after last execution, not before viewer is closed
      if(cleaned) {
        clearInterval(interval);
      }
    };
    const interval = setInterval(getStoriesViews, 10e3);

    createEffect(() => {
      const story = currentStory();
      viewedStories.add(story.id);
    });

    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
    });

    onMount(() => {
      getStoriesViews();
    });
  }

  let footerReactionElement: HTMLSpanElement;
  const footer = (isMe || CHANGELOG_PEER_ID === props.state.peerId || !props.state.peerId.isUser()) && (
    <div
      class={classNames(
        styles.ViewerStoryFooter,
        styles.hideOnSmall,
        rootScope.myId === props.state.peerId && styles.isMe,
        CHANGELOG_PEER_ID === props.state.peerId && styles.isChangelog
      )}
    >
      {isMe ? (
        <>
          <div class={styles.ViewerStoryFooterLeft} onClick={openViewsList}>
            {stackedAvatars() && stackedAvatars().container}
            {getViews()}
          </div>
          <div class={styles.ViewerStoryFooterRight}>
            <ButtonIconTsx icon="delete" onClick={onDeleteClick} />
          </div>
        </>
      ) : (!props.state.peerId.isUser() ? (
        <>
          <div class={styles.ViewerStoryFooterLeft}>
            <span class={styles.ViewerStoryFooterIcon}>
              {Icon('eye1', styles.ViewerStoryFooterIconIcon)}
              {formatNumber((currentStory() as StoryItem.storyItem).views?.views_count || 1, 1)}
            </span>
          </div>
          <div class={styles.ViewerStoryFooterRight}>
            <ButtonIconTsx
              icon="forward"
              onClick={(e) => {
                onShareButtonClick(e, e.target as HTMLElement);
              }}
            />
            <span
              ref={footerReactionElement}
              class={classNames(
                styles.ViewerStoryFooterIcon,
                styles.ViewerStoryFooterReaction,
                (currentStory() as StoryItem.storyItem).sent_reaction && styles.isReacted
              )}
              onClick={(e) => sendReaction({reaction: {_: 'reactionEmoji', emoticon: DEFAULT_REACTION_EMOTICON}, target: footerReactionElement.firstElementChild as HTMLElement})}
            >
              <IconTsx icon={(currentStory() as StoryItem.storyItem).sent_reaction ? 'reactions_filled' : 'reactions'} class={styles.ViewerStoryFooterIconIcon}></IconTsx>
              {(currentStory() as StoryItem.storyItem).views?.reactions_count || 0}
            </span>
          </div>
        </>
      ) : i18n('StoryCantReply'))}
    </div>
  );

  // * my footer end

  createEffect(
    on(
      () => [isActive(), currentStory()],
      () => {
        if(liteMode.isAvailable('animations')) {
          return;
        }

        untrack(() => {
          onTransitionStart();
          onTransitionEnd();
        });
      }
    )
  );

  // createEffect(() => {
  //   if(stories.peer && !liteMode.isAvailable('animations')) {
  //     untrack(() => {
  //       onTransitionStart();
  //       onTransitionEnd();
  //     });
  //   }
  // });

  const onProfileClick = () => {
    const peerId = props.state.peerId;
    props.close(() => {
      appImManager.setInnerPeer({peerId});
    });
  };

  const diffToActive = createMemo(() => {
    return props.index() - props.peers.indexOf(stories.peer);
  });

  const fromLeft = createMemo<boolean>((prev) => {
    return sliding() ? prev : diffToActive() < 0;
  });

  const fromRight = createMemo<boolean>((prev) => {
    return sliding() ? prev : diffToActive() > 0;
  });

  const [fadeIn, setFadeIn] = createSignal(false);

  const shouldShow = createMemo((/* prev */) => {
    const diff = Math.abs(diffToActive());
    let shouldBeVisible: boolean;
    if(/* props.isFull() &&  */!stories.hasViewer) {
      shouldBeVisible = diff === 0;

      if(!props.isFull() && diff <= STORIES_PRESERVE) {
        shouldAddTranslateX = false;
      }
    } else {
      shouldBeVisible = diff <= STORIES_PRESERVE;
    }

    // if(!shouldBeVisible && prev) {
    //   return sliding();
    // }

    return shouldBeVisible;
  });

  createEffect<boolean>((prev) => {
    if(!shouldShow()) {
      // if(prev) {
      setFadeIn(true);
      // }

      return true;
    } else if(prev) {
      setFadeIn(true);

      doubleRaf().then(() => {
        setFadeIn(false);
      });

      return true;
    }
  });

  let div: HTMLDivElement, storyDiv: HTMLDivElement, headerDiv: HTMLDivElement;
  const ret = (
    <div
      ref={div}
      class={styles.ViewerStoryContainer}
      classList={{
        ...(props.isFull() ? {
          [styles.fromLeft]: fromLeft(),
          [styles.current]: isActive(),
          [styles.fromRight]: fromRight()
        } : {
          [styles.small]: !isActive()
        }),
        [styles.hold]: stories.hideInterface && isActive(),
        [styles.focused]: focused(),
        [styles.fadeIn]: fadeIn()
      }}
      style={!props.isFull() && {
        '--translateX': calculateTranslateX()
      }}
      onClick={(e) => {
        if(!isActive()) {
          actions.set({peer: props.state, index: props.state.index});
        } else if(
          captionScrollable.scrollTop &&
          !findUpAsChild(e.target, captionText) &&
          !findUpClassName(e.target, styles.ViewerStoryHeader)
        ) {
          scrollPath(-captionScrollable.scrollTop);
        } else if(
          !stories.paused &&
          !stories.hideInterface &&
          !findUpAsChild(e.target, captionText) &&
          !findUpClassName(e.target, styles.ViewerStoryHeader) &&
          !findUpClassName(e.target, 'stories-input') &&
          !findUpClassName(e.target, styles.ViewerStoryReactions) &&
          findUpClassName(e.target, styles.ViewerStory)
        ) {
          const rect = div.getBoundingClientRect();
          const next = e.clientX > (rect.left + rect.width / 3);
          actions.goToNearestStorySafe(next);
        }
      }}
      onTransitionStart={onTransitionStart}
      onTransitionEnd={onTransitionEnd}
    >
      <div ref={storyDiv} class={classNames(styles.ViewerStory, loading() && isActive() && 'shimmer')}>
        <div class={styles.ViewerStoryContent}>
          {contentItem}
        </div>
        <div class={styles.hideOnSmall}>
          <div class={classNames(styles.ViewerStoryShadow, caption() && styles.hasCaption)}></div>
          <div class={styles.ViewerStorySlides}>
            {slides}
          </div>
          <div ref={headerDiv} class={classNames(styles.ViewerStoryHeader, 'night')}>
            <div class={styles.ViewerStoryHeaderLeft} onClick={onProfileClick}>
              {avatar.element}
              <div class={styles.ViewerStoryHeaderInfo}>
                <div class={styles.ViewerStoryHeaderRow}>
                  {peerTitleElement}
                  {props.splitByDays && (
                    <span class={styles.ViewerStoryHeaderSecondary}>
                      {`${JOINER}${props.state.index + 1}/${props.state.stories.length}`}
                    </span>
                  )}
                </div>
                <div
                  class={classNames(
                    // styles.ViewerStoryHeaderRow,
                    styles.ViewerStoryHeaderSecondary,
                    styles.ViewerStoryHeaderTime
                  )}
                >
                  {getDateText()}
                </div>
              </div>
            </div>
            <div class={styles.ViewerStoryHeaderRight}>
              {privacyType() && privacyIcon}
              <ButtonIconTsx
                icon={stories.paused && !stories.playAfterGesture ? 'play' : 'pause'}
                onClick={() => actions.toggle()}
              />
              {videoDuration() && muteButton}
              {/* <ButtonIconTsx icon={'more'} /> */}
              {btnMenu}
              {props.isFull() && (
                <ButtonIconTsx
                  icon={'close'}
                  onClick={() => props.close()}
                />
              )}
            </div>
          </div>
          {caption() && captionContainer}
          {reactionsMenu()?.widthContainer}
        </div>
        {!props.isFull() && (
          <div class={styles.ViewerStoryInfo}>
            {avatarInfo.node}
            {peerTitleInfoElement}
          </div>
        )}
      </div>
      {storyInput || footer}
      {/* <MessageInputField /> */}
    </div>
  );

  const muteTooltipOptions: Parameters<typeof showTooltip>[0] = {
    container: headerDiv,
    element: muteButtonButton,
    vertical: 'bottom',
    paddingX: 13
  };

  return (
    <Show when={shouldShow()}>
      {ret}
    </Show>
  );
}

export type PassthroughProps<E extends Element> = {element: E} & ParentProps & JSX.HTMLAttributes<E>;
export function Passthrough<E extends Element>(props: PassthroughProps<E>): E {
  const owner = getOwner();
  let content: JSX.Element;

  createEffect(() => {
    content ||= runWithOwner(owner, () => props.children);
    const [_, others] = splitProps(props, ['element']);
    const isSvg = props.element instanceof SVGElement;
    assign(props.element, others, isSvg);
  });

  return props.element;
}

export default function StoriesViewer(props: {
  onExit?: () => void,
  target?: Accessor<Element>,
  splitByDays?: boolean,
  pinned?: boolean
}) {
  const [stories, actions] = useStories();
  const [show, setShow] = createSignal(false);
  const isFull = createMemo(() => {
    return windowSize.height > windowSize.width ||
      windowSize.width < (stories.width + 135 + 8 * 2) ||
      stories.width === windowSize.width;
  });
  const wasShown = createMemo((shown) => shown || show());

  // * fix `ended` property
  actions.viewerReady(false);

  const CANCELABLE_KEYS: Set<string> = new Set([
    'ArrowRight',
    'ArrowLeft',
    'ArrowDown',
    'Space'
  ]);

  const onKeyDown = (e: KeyboardEvent) => {
    if(isTargetAnInput(document.activeElement as HTMLElement)) {
      throttledKeyDown.clear();
      return;
    }

    const activeStoryContainer = getActiveStoryContainer();
    if(animating || !!activeStoryContainer.querySelector('.is-recording')) {
      throttledKeyDown.clear();
      cancelEvent(e);
      return;
    }

    if(CANCELABLE_KEYS.has(e.key) || CANCELABLE_KEYS.has(e.code)) {
      cancelEvent(e);
    } else {
      const input = activeStoryContainer.querySelector<HTMLElement>('.input-message-input');
      if(
        input &&
        !IS_TOUCH_SUPPORTED &&
        input.isContentEditable &&
        overlayCounter.overlaysActive === overlaysActive
      ) {
        focusInput(input, e);
      }
    }

    if(e.key === 'ArrowDown') {
      throttledKeyDown.clear();
      close();
      return;
    }

    throttledKeyDown(e);
  };

  const throttledKeyDown = throttle((e: KeyboardEvent) => {
    if(e.key === 'ArrowRight') {
      actions.goToNearestStorySafe(true);
    } else if(e.key === 'ArrowLeft') {
      actions.goToNearestStorySafe(false);
    } else if(e.code === 'Space') {
      actions.toggle();
    }
  }, 200, true);

  emoticonsDropdown.getElement().classList.add('night');
  emoticonsDropdown.setTextColor('white');

  onCleanup(() => {
    document.body.removeEventListener('keydown', onKeyDown);
    toggleOverlay(false);
    swipeHandler.removeListeners();
    appNavigationController.removeItem(navigationItem);

    emoticonsDropdown.getElement().classList.remove('night');
    emoticonsDropdown.setTextColor();
    emoticonsDropdown.chatInput = undefined;
  });

  const close = (callback?: () => void) => {
    callback && runWithOwner(owner, () => {
      onCleanup(() => {
        callback();
      });
    });

    actions.viewerReady(false);
    dispose();
    actions.pause();
    throttledKeyDown.clear();
    setShow(false);
    div.removeEventListener('click', onDivClick, {capture: true});
  };

  let div: HTMLDivElement, backgroundDiv: HTMLDivElement, closeButton: HTMLButtonElement;
  let dispose: () => void; // * dispose listeners on close to avoid effects during animation
  const ret = createRoot((_dispose) => {
    dispose = _dispose;

    createEffect(() => {
      if(stories.ended) {
        close();
      }
    });

    const storiesReadiness: Set<PeerId> = new Set();
    const storiesShouldBeReady: Set<PeerId> = new Set();
    const perf = performance.now();
    let wasReady = false;

    const openOnReady = () => {
      clearTimeout(timeout)
      wasReady = true;
      console.log('ready', performance.now() - perf);
      runWithOwner(owner, () => {
        onMount(() => {
          open();
        });
      });
    };

    const timeout = setTimeout(() => {
      console.error('stories timeout');
      stories.peers
      .filter((peer) => storiesShouldBeReady.has(peer.peerId) && !storiesReadiness.has(peer.peerId))
      .forEach((peer) => {
        console.error('stories not ready', peer);
      });
      openOnReady();
    }, 250);

    const createStories = (peer: StoriesContextPeerState, index: Accessor<number>) => {
      const onReady = () => {
        storiesReadiness.add(peer.peerId);

        if(wasReady) {
          return;
        }

        // console.log('stories ready', peer.peerId, storiesReadiness.size, performance.now() - perf);

        if(storiesReadiness.size === storiesShouldBeReady.size) {
          openOnReady();
        }
      };

      storiesShouldBeReady.add(peer.peerId);

      const transitionSignal = createSignal(false);
      const ret = (
        <Stories
          state={peer}
          index={index}
          splitByDays={props.splitByDays}
          pinned={props.pinned}
          onReady={onReady}
          close={close}
          peers={itemsToRender()}
          isFull={isFull}
          transitionSignal={transitionSignal}
        />
      );

      const ref = resolveFirst(() => ret);
      createEffect(() => {
        const element = ref();
        if(!element) {
          return;
        }

        transitions.set(element, transitionSignal[0]);

        onCleanup(() => {
          transitions.delete(element);
        });
      });

      return ret;
    };

    const preserve = STORIES_PRESERVE + STORIES_PRESERVE_HIDDEN;
    const getItemsToRender = (index: number) => stories.peers.slice(Math.max(index - preserve, 0), Math.min(index + preserve + 1, stories.peers.length));
    const itemsToRender = createMemo(() => getItemsToRender(stories.index));
    const btnClose = <ButtonIconTsx ref={closeButton} icon={'close'} class={styles.ViewerClose} onClick={() => close()} />;
    const transitions: WeakMap<Element, Accessor<boolean>> = new WeakMap();

    return (
      <div
        ref={div}
        class={classNames(
          styles.Viewer,
          !show() && styles.isInvisible,
          isFull() && styles.isFull,
          stories.hasViewer && styles.isReady
        )}
        onClick={(e) => {
          if(animating) {
            cancelEvent(e);
            return;
          }

          if(e.target === div) {
            close();
          }
        }}
        style={{
          '--stories-width': stories.width + 'px',
          '--stories-height': stories.height + 'px'
        }}
      >
        <div ref={backgroundDiv} class={styles.ViewerBackground} />
        {!isFull() && btnClose}
        {/* <For each={stories.peers}>{createStories}</For> */}
        <TransitionGroup noWait={() => isFull()/*  || !stories.hasViewer */} transitions={transitions}>
          <For each={itemsToRender()}>{createStories}</For>
        </TransitionGroup>
      </div>
    );
  });

  let pauseTimeout: number;
  const swipeHandler = new SwipeHandler({
    element: div,
    onSwipe: (xDiff, yDiff, e) => {
      if(!(e instanceof TouchEvent)) {
        return;
      }

      const jumpOn = Math.min(125, windowSize.width / 3);
      const closeOn = Math.min(125, windowSize.height * 0.2);
      if(yDiff > closeOn) {
        close();
        return true;
      }

      if(Math.abs(xDiff) < jumpOn) {
        return false;
      }

      const peerIndex = stories.peers.indexOf(stories.peer);
      const neighbourIndex = peerIndex + (xDiff < 0 ? 1 : -1);
      const neighbour = stories.peers[neighbourIndex];
      if(!neighbour) {
        close();
      } else {
        actions.set({peer: neighbour});
      }

      return true;
    },
    verifyTouchTarget: (e) => {
      return !findUpClassName(e.target, 'btn-icon') &&
        !findUpClassName(e.target, 'btn-corner') &&
        !findUpClassName(e.target, styles.ViewerStoryMediaArea) &&
        !findUpClassName(e.target, styles.ViewerStoryPrivacy) &&
        !findUpClassName(e.target, styles.ViewerStoryCaptionText) &&
        !findUpClassName(e.target, styles.ViewerStoryReactions) &&
        !!findUpClassName(e.target, styles.ViewerStory) &&
        !findUpClassName(e.target, styles.small) &&
        !findUpClassName(e.target, styles.focused);
    },
    onStart: () => {
      // if(stories.paused && !stories.hideInterface) {
      //   return;
      // }

      pauseTimeout = window.setTimeout(() => {
        actions.pause(true);
      }, 200);
    },
    onReset: (e) => {
      window.clearTimeout(pauseTimeout);
      if(!e ||
        !stories.paused ||
        findUpClassName(e.target, 'btn-icon') ||
        findUpClassName(e.target, styles.ViewerStoryPrivacy) ||
        findUpClassName(e.target, 'btn-corner') ||
        findUpClassName(e.target, styles.ViewerStoryReactions)) {
        return;
      }

      const story = findUpClassName(e.target, styles.ViewerStory);
      const caption = story?.querySelector('.' + styles.ViewerStoryCaption);
      if(caption?.scrollTop) {
        return;
      }

      if(story && stories.hideInterface) {
        document.addEventListener('click', cancelEvent, {capture: true, once: true});
      }

      const playStories = stories.playAfterGesture || !stories.hideInterface;
      actions.toggleInterface(false);
      if(playStories) {
        actions.play();
      }
    }
  });

  let avatarFrom: ReturnType<typeof AvatarNew>;
  const open = () => {
    const target = props.target?.();
    if(!target || !target.classList.contains('avatar')) {
      setShow(true);
      return;
    }

    avatarFrom = AvatarNew({
      size: STORY_HEADER_AVATAR_SIZE,
      isDialog: false,
      useCache: false
    });

    avatarFrom.node.style.cssText = `position: absolute; visibility: hidden; z-index: 1000; transform-origin: top left;`;
    document.body.append(avatarFrom.node);

    if(!untrack(() => show())) {
      createEffect(() => {
        if(avatarFrom.ready()) {
          setShow(true);
        }
      });
    }

    createEffect(() => {
      const peerId = stories.peer?.peerId;
      if(!peerId || !avatarFrom) {
        return;
      }

      avatarFrom.render({peerId});
    });

    onCleanup(() => {
      if(!avatarFrom) {
        return;
      }

      avatarFrom.node.remove();
    });
  };

  const onDivClick = (e: MouseEvent) => {
    if(animating) {
      cancelEvent(e);
    }

    const story = findUpClassName(e.target, styles.ViewerStory);
    const caption = story?.querySelector('.' + styles.ViewerStoryCaptionText) as HTMLElement;
    const callback = caption && onMediaCaptionClick(caption, e);
    if(!callback) {
      return;
    }

    close(callback);
    return false;
  };

  div.addEventListener('click', onDivClick, {capture: true});

  const owner = getOwner();

  const navigationItem: NavigationItem = {
    type: 'stories',
    onPop: () => {
      if(animating) {
        return false;
      }

      close();
    }
  };

  appNavigationController.pushItem(navigationItem);

  const getActiveStoryContainer = (el: Element = div) => {
    return el.querySelector(`.${styles.ViewerStoryContainer}:not(.${styles.small})`) as HTMLElement;
  };

  const animate = (el: Element, forwards: boolean, done: () => void) => {
    const container = getActiveStoryContainer(el);
    if(!liteMode.isAvailable('animations') || !container) {
      done();
      return;
    }

    const containers = Array.from(el.querySelectorAll(`.${styles.ViewerStoryContainer}`));
    let needAvatarOpacity: boolean;
    const target = untrack(() => {
      const target = props.target?.();
      if(!target) {
        return;
      }

      const overflowElement = findUpClassName(target, 'scrollable');
      if(!overflowElement) {
        return target;
      }

      const visibleRect = getVisibleRect(target as HTMLElement, overflowElement);
      if(!visibleRect) {
        if(avatarFrom) {
          avatarFrom.node.remove();
          avatarFrom = undefined;
        }

        return;
      }

      if(avatarFrom && (visibleRect.overflow.horizontal || visibleRect.overflow.vertical)) {
        needAvatarOpacity = true;
      }

      return target;
    });
    const rectFrom = target && (target.querySelector('.avatar') || target).getBoundingClientRect();
    const rectTo = container.getBoundingClientRect();
    const borderRadius = avatarFrom ? '50%' : window.getComputedStyle(container).borderRadius;

    const options: KeyframeAnimationOptions = {
      duration: 250,
      easing: 'cubic-bezier(0.4, 0.0, 0.6, 1)',
      direction: forwards ? 'normal' : 'reverse'
    };

    // * animate avatar movement
    let avatarAnimation: Animation, avatar: HTMLElement;
    if(avatarFrom) {
      avatar = container.querySelector<HTMLElement>(`.${styles.ViewerStoryHeaderAvatar}`);
      avatar.style.visibility = 'hidden';
      // const rectFrom = props.target.querySelector('.avatar').getBoundingClientRect();
      const rectTo = avatar.getBoundingClientRect();
      avatarFrom.node.style.top = `${rectFrom.top}px`;
      avatarFrom.node.style.left = `${rectFrom.left}px`;
      avatarFrom.node.style.visibility = '';
      if(!avatarFrom.node.parentElement) {
        document.body.append(avatarFrom.node);
      }
      const translateX = rectTo.left - rectFrom.left;
      const translateY = rectTo.top - rectFrom.top;

      const keyframes: Keyframe[] = [{
        transform: `translate(0, 0) scale(${rectFrom.width / STORY_HEADER_AVATAR_SIZE})`
      }, {
        transform: `translate(${translateX}px, ${translateY}px) scale(1)`
      }];

      if(needAvatarOpacity) {
        keyframes[0].opacity = 0;
        keyframes[1].opacity = 1;
      }

      avatarAnimation = avatarFrom.node.animate(keyframes, options);
    }

    const setOverflow = (overflow: boolean) => {
      // container.style.overflow = overflow ? 'visible' : '';
    };

    if(!forwards) {
      setOverflow(false);
    }

    // * animate main container
    const translateX = rectFrom && rectFrom.left - (windowSize.width / 2) + rectFrom.width / 2;
    const translateY = rectFrom && rectFrom.top - (windowSize.height / 2) + rectFrom.height / 2;
    const containerAnimation = rectFrom && container.animate([{
      borderRadius,
      transform: `translate3d(${translateX}px, ${translateY}px, 0) scale3d(${rectFrom.width / rectTo.width}, ${rectFrom.height / rectTo.height}, 1)`,
      opacity: 0
    }, {
      opacity: 1,
      offset: 0.3
    }, {
      borderRadius: '0%',
      transform: `translate3d(0, 0, 0) scale3d(1, 1, 1)`
    }], options);

    // * animate simple opacity
    const opacityAnimations = (containerAnimation ?
      [backgroundDiv, !isFull() && closeButton].filter(Boolean) :
      [container, el]
    ).map((element) => {
      return element.animate([{opacity: 0}, {opacity: 1}], options);
    });

    // * animate small containers
    const activeIndex = containers.indexOf(container);
    containers.splice(activeIndex, 1);
    const before = containers.slice(0, activeIndex);
    const after = containers.slice(activeIndex);
    const animateSmallContainers = (containers: Element[], next: boolean) => {
      if(!rectFrom) {
        return containers.map((container) => {
          return container.animate([{opacity: 0}, {opacity: 1}], options);
        });
      }

      return containers.map((container, idx, arr) => {
        const offsetX = (next ? idx + 1 : (arr.length - idx)) * 60 * (next ? -1 : 1);
        return container.animate([{
          transform: `translate3d(calc(var(--translateX) + ${offsetX}px), 0, 0) scale3d(${STORY_SCALE_SMALL / 2}, ${STORY_SCALE_SMALL / 2}, 1)`,
          opacity: 0.001 // fix lag with fractal opacity so element should be prepared for animation
        }, {
          opacity: 0.001,
          offset: 0.5
        }, {
          transform: `translate3d(var(--translateX), 0, 0) scale3d(${STORY_SCALE_SMALL}, ${STORY_SCALE_SMALL}, 1)`,
          opacity: 1
        }], options);
      })
    };

    const animations = [
      ...opacityAnimations,
      containerAnimation,
      avatarAnimation,
      ...animateSmallContainers(before, false),
      ...animateSmallContainers(after, true)
    ];

    const promises = animations.map((animation) => animation?.finished);
    return Promise.all(promises).then(() => {
      if(avatarFrom) {
        avatarFrom.node.remove();
        avatar.style.visibility = '';
      }

      if(forwards) {
        setOverflow(true);
      }

      done();
    });
  };

  let overlaysActive: number;
  const toggleOverlay = (active: boolean) => {
    actions.toggleSorting('viewer', active);
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);

    if(active) {
      overlaysActive = overlayCounter.overlaysActive;
    }
  };

  const listenerSetter = createListenerSetter();
  let wasPlayingBeforeIdle: boolean;
  listenerSetter.add(idleController)('change', (idle) => {
    if(idle) {
      wasPlayingBeforeIdle = !stories.paused;
      actions.pause();
      x.open();
      return;
    }

    const onMouseDown = () => {
      clearTimeout(timeout);
    };

    document.body.addEventListener('mousedown', onMouseDown, {once: true});
    const timeout = setTimeout(() => {
      document.body.removeEventListener('mousedown', onMouseDown);
      x.close();
    }, 100);

    if(wasPlayingBeforeIdle) {
      actions.play();
    }
  });

  let wasPlayingBeforeOverlay: boolean;
  listenerSetter.add(overlayCounter)('change', () => {
    const active = overlayCounter.overlaysActive;
    if(active > overlaysActive) {
      wasPlayingBeforeOverlay = !stories.paused;
      actions.pause();
    } else if(active === overlaysActive && wasPlayingBeforeOverlay) {
      actions.play();
    }
  });

  let animating = true;
  return (
    <Show when={wasShown()} fallback={ret}>
      <Transition
        onEnter={(el, done) => {
          document.body.addEventListener('keydown', onKeyDown);
          toggleOverlay(true);
          animate(el, true, done);
        }}
        onAfterEnter={() => {
          animating = false;
          actions.viewerReady(true);
          // play();
        }}
        onExit={(el, done) => {
          animating = true;
          actions.viewerReady(false);
          animate(el, false, done);
        }}
        onAfterExit={() => {
          animating = false;
          props.onExit?.();
          stop();
        }}
        appear
      >
        {show() && ret}
      </Transition>
    </Show>
  );
}

export const createStoriesViewer = (
  props: Parameters<typeof StoriesViewer>[0] & Parameters<typeof StoriesProvider>[0]
): JSX.Element => {
  if(props.peers && !props.onExit) {
    return createRoot((dispose) => {
      props.onExit = () => dispose();
      return (
        <StoriesProvider peers={props.peers} index={props.index}>
          {createStoriesViewer(props)}
        </StoriesProvider>
      );
    });
  }

  return (
    <Portal mount={document.getElementById('stories-viewer')}>
      <StoriesViewer {...props} />
    </Portal>
  );
};

export const createStoriesViewerWithStory = (
  props: Omit<Parameters<typeof createStoriesViewer>[0], 'peers' | 'index'> & {
    peerId: PeerId,
    storyItem: StoryItem
  }
) => {
  const [, rest] = splitProps(props, ['peerId', 'storyItem']);
  return createStoriesViewer({
    ...rest,
    peers: [{
      peerId: props.peerId,
      stories: [props.storyItem],
      index: 0
    }],
    index: 0
  });
};

export const createStoriesViewerWithPeer = async(
  props: Omit<Parameters<typeof createStoriesViewer>[0], 'peers' | 'index'> & {
    peerId: PeerId,
    id?: number
  }
): Promise<void> => {
  const [, rest] = splitProps(props, ['peerId', 'id']);
  const peerStories = await rootScope.managers.appStoriesManager.getPeerStories(props.peerId);
  const storyIndex = props.id ? peerStories.stories.findIndex((story) => story.id === props.id) : undefined;
  if(props.id) {
    const storyItem = await rootScope.managers.appStoriesManager.getStoryById(props.peerId, props.id);
    if(!storyItem) {
      toastNew({langPackKey: 'Story.ExpiredToast'});
      return;
    }
    // if(storyItem) { // own story can be missed in PeerStories
    //   return createStoriesViewerWithPeer(props);
    // }

    createStoriesViewerWithStory({
      ...rest,
      peerId: props.peerId,
      storyItem,
      singleStory: true
    });
    return;
  }

  createStoriesViewer({
    ...rest,
    peers: [{
      peerId: props.peerId,
      stories: peerStories.stories,
      maxReadId: peerStories.max_read_id,
      index: storyIndex
    }],
    index: 0
  });
};

// export const openStories = (target?: Parameters<typeof StoriesViewer>[0]['target'], onExit?: () => void) => {
//   const dispose = render(
//     () => (
//       <StoriesProvider stories={[]}>
//         <StoriesViewer onExit={() => {dispose(); onExit?.();}} target={target} />
//       </StoriesProvider>
//     ),
//     document.getElementById('stories-viewer')
//   );
// };
