/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type LazyLoadQueue from '../lazyLoadQueue';
import {formatTime, getFullDate} from '../../helpers/date';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {Middleware} from '../../helpers/middleware';
import formatNumber from '../../helpers/number/formatNumber';
import {Message} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n, _i18n} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../lib/rootScope';
import Icon from '../icon';
import PeerTitle from '../peerTitle';
import wrapReply from '../wrappers/reply';
import Chat, {ChatType} from './chat';
import RepliesElement from './replies';
import ChatBubbles from './bubbles';

const NBSP = '&nbsp;';

const makeEdited = () => {
  const edited = document.createElement('i');
  edited.classList.add('time-edited', 'time-part');
  _i18n(edited, 'EditedMessage');
  return edited;
};

const makeSponsored = () => i18n('SponsoredMessage');

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (options: {
    chatType: ChatType,
    message: Message.message | Message.messageService,
    reactionsMessage?: Message.message
  }) => {
    const {chatType, message} = options;
    const date = new Date(message.date * 1000);
    const args: (HTMLElement | string)[] = [];

    let editedSpan: HTMLElement,
      sponsoredSpan: HTMLElement;
      // reactionsElement: ReactionsElement,
      // reactionsMessage: Message.message;

    const isSponsored = !!(message as Message.message).pFlags.sponsored;
    const isMessage = !('action' in message) && !isSponsored;
    // let hasReactions: boolean;

    const time: HTMLElement = isSponsored ? undefined : formatTime(date);
    if(isMessage) {
      if(message.views) {
        const postAuthor = message.post_author || message.fwd_from?.post_author;

        const postViewsSpan = document.createElement('span');
        postViewsSpan.classList.add('post-views');
        postViewsSpan.textContent = formatNumber(message.views, 1);

        const channelViews = Icon('channelviews', 'time-icon', 'time-part', 'time-icon-views');

        args.push(postViewsSpan, channelViews);
        if(postAuthor) {
          const span = document.createElement('span');
          span.classList.add('post-author');
          setInnerHTML(span, wrapEmojiText(postAuthor));
          span.insertAdjacentHTML('beforeend', ',' + NBSP)
          args.push(span);
        }
      }

      if(message.edit_date && chatType !== 'scheduled' && !message.pFlags.edit_hide) {
        args.unshift(editedSpan = makeEdited());
      }

      if(chatType !== 'pinned' && message.pFlags.pinned) {
        const i = Icon('pinnedchat', 'time-icon', 'time-pinned', 'time-part');
        args.unshift(i);
      }

      // if(USER_REACTIONS_INLINE && message.peer_id._ === 'peerUser'/*  && message.reactions?.results?.length */) {
      //   hasReactions = true;

      //   reactionsMessage = options.reactionsMessage;
      //   reactionsElement = new ReactionsElement();
      //   reactionsElement.init(reactionsMessage, 'inline', true);
      //   reactionsElement.render();
      //   args.unshift(reactionsElement);
      // }
    } else if(isSponsored) {
      args.push(sponsoredSpan = makeSponsored());
    }

    if(time) {
      args.push(time);
    }

    let title = isSponsored ? undefined : getFullDate(date);
    if(isMessage) {
      title += (message.edit_date && !message.pFlags.edit_hide ? `\nEdited: ${getFullDate(new Date(message.edit_date * 1000))}` : '') +
        (message.fwd_from ? `\nOriginal: ${getFullDate(new Date(message.fwd_from.date * 1000))}` : '');
    }

    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time');
    // if(title) timeSpan.title = title;
    timeSpan.append(...args);

    const inner = document.createElement('div');
    inner.classList.add('time-inner');
    if(title) inner.title = title;

    let clonedArgs = args;
    if(editedSpan) {
      clonedArgs[clonedArgs.indexOf(editedSpan)] = makeEdited();
    }
    if(sponsoredSpan) {
      clonedArgs[clonedArgs.indexOf(sponsoredSpan)] = makeSponsored();
    }
    // if(reactionsElement) {
    //   const _reactionsElement = clonedArgs[clonedArgs.indexOf(reactionsElement)] = new ReactionsElement();
    //   _reactionsElement.init(reactionsMessage, 'inline');
    //   _reactionsElement.render();
    // }
    clonedArgs = clonedArgs.map((a) => {
      return a instanceof HTMLElement && !a.classList.contains('i18n') && !a.classList.contains('reactions') ?
        a.cloneNode(true) as HTMLElement :
        a;
    });
    if(time) {
      clonedArgs[clonedArgs.length - 1] = formatTime(date); // clone time
    }
    inner.append(...clonedArgs);

    timeSpan.append(inner);

    return timeSpan;
  };

  export const renderReplies = ({bubble, bubbleContainer, message, messageDiv, loadPromises, lazyLoadQueue, middleware}: {
    bubble: HTMLElement,
    bubbleContainer: HTMLElement,
    message: Message.message,
    messageDiv: HTMLElement,
    loadPromises?: Promise<any>[],
    lazyLoadQueue?: LazyLoadQueue,
    middleware: Middleware
  }) => {
    const isFooter = !bubble.classList.contains('sticker') && !bubble.classList.contains('emoji-big') && !bubble.classList.contains('round');
    const repliesFooter = new RepliesElement();
    repliesFooter.message = message;
    repliesFooter.type = isFooter ? 'footer' : 'beside';
    repliesFooter.loadPromises = loadPromises;
    repliesFooter.lazyLoadQueue = lazyLoadQueue;
    repliesFooter.middlewareHelper = middleware.create();
    repliesFooter.init();
    bubbleContainer.prepend(repliesFooter);
    return isFooter;
  };

  export const setReply = async({chat, bubble, bubbleContainer, message, appendCallback, middleware, lazyLoadQueue, needUpdate, isStandaloneMedia, isOut}: {
    chat: Chat,
    bubble: HTMLElement,
    bubbleContainer?: HTMLElement,
    message: Message.message,
    appendCallback?: (container: HTMLElement) => void,
    middleware: Middleware,
    lazyLoadQueue: LazyLoadQueue,
    needUpdate: ChatBubbles['needUpdate'],
    isStandaloneMedia: boolean,
    isOut: boolean
  }) => {
    const isReplacing = !bubbleContainer;
    if(isReplacing) {
      bubbleContainer = bubble.querySelector('.bubble-content');
    }

    const currentReplyDiv = isReplacing ? bubbleContainer.querySelector('.reply') : null;
    const replyTo = message.reply_to;
    if(!replyTo) {
      currentReplyDiv?.remove();
      bubble.classList.remove('is-reply');
      return;
    }

    const isStoryReply = replyTo._ === 'messageReplyStoryHeader';

    const replyToPeerId = isStoryReply ?
      replyTo.user_id.toPeerId(false) :
      (
        replyTo.reply_to_peer_id ?
          getPeerId(replyTo.reply_to_peer_id) :
          chat.peerId
      );

    const originalMessage = !isStoryReply && await apiManagerProxy.getMessageByPeer(replyToPeerId, message.reply_to_mid);
    const originalStory = isStoryReply && await rootScope.managers.acknowledged.appStoriesManager.getStoryById(replyToPeerId, replyTo.story_id);
    let originalPeerTitle: string | HTMLElement | DocumentFragment;

    let titlePeerId: PeerId;
    if(isStoryReply) {
      if(!originalStory.cached) {
        needUpdate.push({replyToPeerId, replyStoryId: replyTo.story_id, mid: message.mid});
        rootScope.managers.appMessagesManager.fetchMessageReplyTo(message);

        originalPeerTitle = i18n('Loading');
      } else {
        titlePeerId = replyToPeerId;
        originalPeerTitle = new PeerTitle({
          peerId: titlePeerId,
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }).element;
      }
    } else if(!originalMessage) {
      // from different peer
      if(replyTo.reply_from) {
        originalPeerTitle = new PeerTitle({
          peerId: titlePeerId = getPeerId(replyTo.reply_from?.from_id || replyTo.reply_to_peer_id),
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }).element;
      } else {
        needUpdate.push({replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid});
        rootScope.managers.appMessagesManager.fetchMessageReplyTo(message);

        originalPeerTitle = i18n('Loading');
      }
    } else {
      const originalMessageFwdFromId = (originalMessage as Message.message).fwdFromId;
      titlePeerId = message.fwdFromId && message.fwdFromId === originalMessageFwdFromId ?
        message.fwdFromId :
        originalMessage.fromId || originalMessageFwdFromId;
      originalPeerTitle = new PeerTitle({
        peerId: titlePeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false,
        fromName: !titlePeerId ? (originalMessage as Message.message).fwd_from?.from_name : undefined
      }).element;
    }

    if(!isStoryReply && replyTo.reply_from) {
      const fragment = document.createDocumentFragment();
      let icon: HTMLElement;
      if(replyTo.reply_from.channel_post) {
        fragment.append(icon = Icon('newchannel_filled'), originalPeerTitle);
      } else if(replyTo.reply_to_peer_id) {
        const groupPeerTitle = new PeerTitle({
          peerId: getPeerId(replyTo.reply_to_peer_id),
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }).element;

        fragment.append(originalPeerTitle, ' ', icon = Icon('newgroup'), ' ', groupPeerTitle);
      }

      if(icon) {
        icon.classList.add('inline-icon', 'reply-title-icon');
        originalPeerTitle = fragment;
      }
    }

    const isStoryExpired = isStoryReply && originalStory.cached && !(await originalStory.result);
    const {container, fillPromise} = wrapReply({
      title: originalPeerTitle,
      animationGroup: chat.animationGroup,
      message: originalMessage,
      isStoryExpired,
      storyItem: originalStory?.cached && await originalStory.result,
      setColorPeerId: titlePeerId,
      textColor: 'primary-text-color',
      isQuote: !isStoryReply ? replyTo.pFlags.quote : undefined,
      middleware,
      lazyLoadQueue,
      replyHeader: replyTo,
      useHighlightningColor: isStandaloneMedia,
      colorAsOut: isOut
    });

    await fillPromise;
    if(currentReplyDiv) {
      if(currentReplyDiv.classList.contains('floating-part')) {
        container.classList.add('floating-part');
      }
      currentReplyDiv.replaceWith(container);
    } else {
      appendCallback(container);
    }
    // bubbleContainer.insertBefore(, nameContainer);
    bubble.classList.add('is-reply');

    return container;
  };
}
