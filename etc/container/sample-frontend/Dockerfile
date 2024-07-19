FROM nginx:alpine3.17

COPY index.html /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf.template

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
# Docker ComposeやECS側で実行する場合は環境変数を上書きする
#CMD /bin/sh -c "envsubst '\$FLASK_APP_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"
