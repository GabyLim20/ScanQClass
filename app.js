
require("dotenv").config({ quiet: true });

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cors = require('cors');
const routes = require('./assets/routes');
const { sequelize } = require('./assets/models');

const app = express();
const port = Number(process.env.PORT) || 3000;
app.use(cors());

const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 100, 
});
app.use(limiter);
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/', routes);

sequelize.authenticate()
    .then(() => {
        console.log('Conexión a la base de datos establecida correctamente.');
    })
    .catch((error) => {
    console.error('Error al conectar a la base de datos:', error);
});
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
