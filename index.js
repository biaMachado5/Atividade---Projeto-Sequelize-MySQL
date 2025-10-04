const express = require('express');
const exphbs = require('express-handlebars');
const path = require('path');
const { Op } = require('sequelize');

// Importando conexão e modelos
const conn = require('./db/conn');
const User = require('./models/User');
const Address = require('./models/Address');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURAÇÃO DO HANDLEBARS
// ===============================
app.engine('handlebars', exphbs.engine({
  defaultLayout: 'main',
  helpers: {
    eq: (a, b) => a == b,
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    range: (from, to) => Array.from({ length: to - from + 1 }, (_, i) => i + from),
  },
  runtimeOptions: {
    allowProtoPropertiesByDefault: true,
    allowProtoMethodsByDefault: true,
  }
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// ===============================
// MIDDLEWARES
// ===============================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===============================
// ROTAS PRINCIPAIS
// ===============================

// Página inicial - lista usuários com filtros e paginação
app.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 3;
    const offset = (page - 1) * limit;

    const { q, newsletter } = req.query;
    const where = {};
    if (q) where.name = { [Op.like]: `%${q}%` };
    if (newsletter) where.newsletter = newsletter === 'true';

    const { rows: users, count } = await User.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      raw: true,
    });

    res.render('home', {
      users,
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      q,
      newsletter,
    });
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    res.render('home', { users: [], error: 'Erro ao carregar usuários' });
  }
});

// ===============================
// ROTAS DE USUÁRIOS
// ===============================

// Página de cadastro de usuário
app.get('/users/create', (req, res) => {
  res.render('adduser');
});

// Criar novo usuário
app.post('/users/create', async (req, res) => {
  try {
    const { name, occupation, newsletter } = req.body;

    if (!name || name.trim().length < 2) {
      return res.render('adduser', {
        error: 'Nome deve ter pelo menos 2 caracteres',
        formData: { name, occupation, newsletter }
      });
    }

    const userData = {
      name: name.trim(),
      occupation: occupation ? occupation.trim() : null,
      newsletter: newsletter === 'on'
    };

    const user = await User.create(userData);
    console.log('Usuário criado:', user.toJSON());
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.render('adduser', { error: 'Erro ao criar usuário: ' + error.message, formData: req.body });
  }
});

// Ver detalhes de um usuário
app.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, { include: [{ model: Address, as: 'addresses' }] });
    if (!user) return res.render('userview', { error: 'Usuário não encontrado' });

    res.render('userview', { user: user.toJSON() });
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.render('userview', { error: 'Erro ao carregar usuário' });
  }
});

// Página de edição de usuário
app.get('/users/edit/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, { include: [{ model: Address, as: 'addresses', order: [['createdAt', 'DESC']] }] });
    if (!user) return res.redirect('/');
    res.render('useredit', { user: user.toJSON() });
  } catch (error) {
    console.error('Erro ao buscar usuário para edição:', error);
    res.redirect('/');
  }
});

// Atualizar usuário
app.post('/users/update', async (req, res) => {
  try {
    const { id, name, occupation, newsletter } = req.body;

    if (!name || name.trim().length < 2) return res.redirect(`/users/edit/${id}`);

    const updateData = {
      name: name.trim(),
      occupation: occupation ? occupation.trim() : null,
      newsletter: newsletter === 'on'
    };

    const [updatedRows] = await User.update(updateData, { where: { id } });
    if (updatedRows > 0) console.log(`Usuário ${id} atualizado com sucesso`);

    res.redirect('/');
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.redirect(`/users/edit/${req.body.id || ''}`);
  }
});

// Excluir usuário
app.post('/users/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Address.destroy({ where: { userId: id } });
    const deletedRows = await User.destroy({ where: { id } });
    if (deletedRows > 0) console.log(`Usuário ${id} e seus endereços foram excluídos`);
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.redirect('/');
  }
});

// ===============================
// ROTAS DE ENDEREÇOS
// ===============================

// Criar novo endereço
app.post('/address/create', async (req, res) => {
  try {
    const { userId, street, number, city } = req.body;
    if (!street || street.trim().length < 5 || !city || city.trim().length < 2) return res.redirect(`/users/edit/${userId}`);

    const address = await Address.create({
      street: street.trim(),
      number: number ? number.trim() : null,
      city: city.trim(),
      userId
    });

    console.log('Endereço criado:', address.toJSON());
    res.redirect(`/users/edit/${userId}`);
  } catch (error) {
    console.error('Erro ao criar endereço:', error);
    res.redirect(`/users/edit/${req.body.userId || ''}`);
  }
});

// Excluir endereço
app.post('/address/delete', async (req, res) => {
  try {
    const { id, userId } = req.body;
    await Address.destroy({ where: { id } });
    console.log(`Endereço ${id} excluído`);
    res.redirect(userId ? `/users/edit/${userId}` : '/');
  } catch (error) {
    console.error('Erro ao excluir endereço:', error);
    res.redirect('/');
  }
});

// ===============================
// ERRO 404
// ===============================
app.use((req, res) => {
  res.status(404).render('home', { users: [], error: 'Página não encontrada' });
});

// ===============================
// INICIALIZAÇÃO DO SERVIDOR
// ===============================
async function startServer() {
  try {
    await conn.sync();
    console.log('✅ Modelos sincronizados com o banco de dados!');
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}
startServer();

module.exports = app;
