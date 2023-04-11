import Koa from 'koa';
import Router from 'koa-router';

const app = new Koa();
const router = new Router();

app.use(router.routes());

router.get('/', (ctx, next) => {
  ctx.body = 'Hello World';
});

app.listen(80,() => {
  console.log('Server is running on port 80');
});