document.addEventListener('DOMContentLoaded', init);

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
        console.debug('Sending message:', this.newMessage);

        const userMessage = this.newMessage;
        this.messages.push(['user', userMessage]);
        this.newMessage = '';
        this.loading = true;
        this.error = false;

        this.$nextTick(() => {
          this.scrollToBottom(true);
        });

        try {
          const sendData = JSON.parse(JSON.stringify(this.messages));
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
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
          this.newMessage = userMessage;
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
        const messageElements = document.querySelectorAll('.markdown-message span');
        messageElements.forEach((el) => {
          el.innerHTML = marked.parse(el.textContent);
        });
      },
    },
    mounted() {
      this.$nextTick(() => {
        this.scrollToBottom();
        // this.renderMarkdown();
      });
    },
    updated() {
      this.$nextTick(() => {
        this.renderMarkdown();
      });
    },
  }).mount('#app');
};
