document.addEventListener('DOMContentLoaded', init);

const MESSAGES_ARRAY_LENGTH_LIMIT = 30;
const MESSAGES_TEXT_LENGTH_LIMIT = 10000;
const MESSAGE_LENGTH_LIMIT = 5000;

async function init() {
  const { createApp } = Vue;

  createApp({
    data() {
      return {
        messages: [
          ['ai', 'こんにちは！何かお困りですか？'],
        ],
        loading: false,
        error: false,
        newMessage: '',
      };
    },
    methods: {
      async sendMessage() {
        if (this.newMessage.trim() === '') {
          return;
        }

        // limit messages length
        if (this.messages.length > MESSAGES_ARRAY_LENGTH_LIMIT || this.messages.some((m) => m[1].length > MESSAGE_LENGTH_LIMIT) || JSON.stringify(this.messages).length > MESSAGES_TEXT_LENGTH_LIMIT) {
          console.error('Message is too long');
          this.error = true;
          return;
        }

        // sanitize message
        const sanitizedMessage = DOMPurify.sanitize(this.newMessage);
        console.debug('Sending sanitized message:', sanitizedMessage);

        const userMessage = sanitizedMessage;
        this.messages.push(['user', userMessage]);
        this.newMessage = '';
        this.loading = true;
        this.error = false;

        this.$nextTick(() => {
          this.scrollToBottom(true);
        });

        try {
          const sendData = JSON.parse(JSON.stringify(this.messages));
          const csrfToken = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ messages: sendData }),
          });

          if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
          }
          const data = await res.json();
          console.debug('Received response:', data);

          this.loading = false;

          const responseMessage = data.response.trim();
          this.messages.push(['ai', responseMessage]);
        } catch (e) {
          this.error = true;
          this.messages.pop();
          this.newMessage = sanitizedMessage;
          this.loading = false;
        }

        this.$nextTick(() => {
          this.scrollToBottom(true);
        });
      },

      scrollToBottom(smooth = false) {
        const wrapper = this.$refs.wrapper;
        if (wrapper) {
          if (smooth) {
            wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: 'smooth' });
          } else {
            wrapper.scrollTop = wrapper.scrollHeight;
          }
        }
      },

      renderMarkdown() {
        const messageElement = document.querySelectorAll('.markdown-message span.content');
        if (messageElement[messageElement.length - 1].innerHTML.includes('<p>')) {
          return;
        }

        messageElement[messageElement.length - 1].innerHTML = marked.parse(messageElement[messageElement.length - 1].textContent);
      },
    },
    mounted() {
      this.$nextTick(() => {
        this.scrollToBottom();
        this.renderMarkdown();
      });
    },
    updated() {
      this.$nextTick(() => {
        this.renderMarkdown();
      });
    },
  }).mount('#app');
};
