# Nogueira Venda — TV Corporativa

Site para Smart TVs reproduzirem, em sequência e loop, vídeos armazenados em **uma única pasta do Google Drive**. Todas as TVs consultam a mesma playlist. Layout horizontal 16:9, marca corporativa tipográfica, player HTML5 com botões discretos, tela cheia, modo sem som (padrão) e atualização automática a cada 60 segundos.

## 1. Criar a pasta e enviar vídeos

1. No Google Drive, crie uma pasta, por exemplo **Nogueira TV**.
2. Envie os vídeos. **MP4 codificado em H.264 (vídeo) + AAC (áudio)** é a opção recomendada para Smart TVs; WebM e MOV podem não funcionar em todos os modelos.
3. Renomeie usando prefixos de ordenação (`01 - Institucional.mp4`, `02 - Empreendimento.mp4`, ...). A playlist é ordenada por **nome do arquivo**.
4. Copie o ID da pasta: `https://drive.google.com/drive/folders/ID_DA_PASTA`.
5. Novos vídeos são detectados em até ~60 segundos na aplicação; a mudança de lista **não interrompe o vídeo atual**, exceto se ele tiver sido removido.

## 2. Obter acesso ao Drive — método A: conta de serviço

> ATENÇÃO: Organizações Google Workspace podem proibir compartilhamento com contas de serviço. Se o administrador bloquear, use o método B (OAuth) com uma conta autorizada. O acesso à pasta é feito no servidor, não no navegador da TV.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou selecione um projeto e ative **Google Drive API**.
2. Vá a **IAM e administrador → Contas de serviço**, crie uma conta e gere uma **chave JSON**. Guarde-a em local seguro; não faça upload da chave para repositórios públicos.
3. Copie o `client_email` desse JSON e compartilhe a pasta do Drive com esse e-mail como **Leitor**. Para pastas em unidades compartilhadas, confirme a permissão com o administrador.
4. Converta o conteúdo do JSON inteiro para Base64. No PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\chave.json"))
   ```
5. Cole o resultado na variável `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` no servidor. A chave **nunca** deve ser adicionada ao HTML ou compartilhada publicamente.

## 3. Alternativa de autorização — método B: OAuth de usuário

Para ambientes que não permitem a conta de serviço, crie credenciais OAuth do Google em um projeto com Drive API ativa, conceda o escopo `https://www.googleapis.com/auth/drive.readonly` e obtenha um **refresh token** da conta Google que tenha acesso à pasta. Configure estas três variáveis no servidor: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN`, deixando `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` vazio. Para uso contínuo, publique o app OAuth em **Produção** após a configuração e aprovação necessária do Workspace; tokens de aplicativos externos em modo Testing podem expirar após 7 dias. Um administrador do domínio poderá precisar autorizar o app. Mantenha os tokens secretos. O projeto não implementa fluxo de obtenção de tokens OAuth na interface: isso deve ser feito por um administrador durante a implantação.

## 4. Executar localmente

Requisitos: Node.js 20+.

```bash
npm install
cp .env.example .env
# Preencha DRIVE_FOLDER_ID e credenciais
npm start
```

No Windows, copie `.env.example` para `.env` manualmente. Acesse `http://localhost:3000`.

## 5. Publicar (Render + GitHub)

1. Suba **somente os arquivos deste projeto** em um repositório privado no GitHub. O arquivo `.env` está no `.gitignore`: nunca envie chaves privadas.
2. No [Render](https://render.com/), crie **New → Web Service**, conecte o repositório; o `Dockerfile` já define a instalação/inicialização. Use um plano pago com instância sempre ativa para evitar suspensão em horários de operação.
3. Na seção **Environment**, defina `DRIVE_FOLDER_ID` e `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` (ou as três variáveis OAuth). Defina `PLAYLIST_REFRESH_SECONDS=60` e `NODE_ENV=production`.
4. Faça o deploy e teste `https://SEU-SITE.onrender.com/health` e `https://SEU-SITE.onrender.com/api/playlist`.
5. Abra `https://SEU-SITE.onrender.com` na Smart TV. Use **Tela cheia**; alguns navegadores de TV exigem pressionar **Iniciar TV corporativa** uma vez após abrir a página.
6. Para domínio próprio (ex. tv.suaempresa.com.br), configure um domínio personalizado no Render e os registros DNS indicados na plataforma.

**Importante:** a hospedagem deve suportar **streaming HTTP e requisições Range (206 Partial Content)**. O servidor utiliza o Google Drive como origem e transmite os bytes sem expor credenciais ao navegador. As TVs reproduzem a **mesma sequência de vídeos**, mas **não ficam sincronizadas no mesmo segundo**. O consumo de rede/banda do servidor cresce com o número de TVs. Conteúdo acessível pelo endereço público do site pode ser visto por qualquer pessoa com o endereço; use arquivos apropriados para exibição pública ou implemente autenticação/restrição de rede antes de publicar conteúdo sensível.

## Uso diário

- **Adicionar vídeo:** envie MP4 para a pasta. Aparecerá automaticamente.
- **Remover vídeo:** exclua da pasta ou mova-o para fora dela.
- **Reorganizar:** ajuste o prefixo numérico do nome dos arquivos.
- **Som:** desligado por padrão para garantir autoplay. Use botão **Sem som** para ligar ou acrescente `?som=1` ao endereço, sabendo que autoplay com som pode ser bloqueado.
- **Atualizar TVs:** não é necessário atualizar a página; a playlist é consultada a cada 60 s. Se o vídeo atual for substituído por outro arquivo de mesmo nome, terá outro ID e será iniciado o primeiro item da playlist.

## Limitações práticas

- Alguns navegadores de TVs antigas não suportam recursos modernos de JavaScript, codecs ou reprodução automática. Teste no aparelho antes de instalar em todos os escritórios.
- Google Drive possui cotas e limites de download; para uso em muitas TVs 24/7, recomenda-se migrar os vídeos para armazenamento/CDN próprios (mantendo Drive como painel de cadastro), se necessário.
- Se a conexão cair, o vídeo atualmente em streaming poderá parar. O site tenta recarregar a lista automaticamente, mas não tem cache offline.
- Sem credenciais válidas e um ID de pasta real, o projeto abre a tela institucional, mas não pode reproduzir vídeos da sua conta.
