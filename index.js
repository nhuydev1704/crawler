const { default: axios } = require("axios");
const Crawler = require("crawler");
const mongoose = require("mongoose");

const url = "mongodb://localhost:27017/car"; // replace with your MongoDB connection string

// Define a schema
const BrandSchema = new mongoose.Schema({
  type: {
    type: String,
    default: "car",
  },
  src: String,
  alt: String,
  description: String,
  id: Number,
  compare: Object,
  faq: Object,
  info: Object,
});

// Define a car schema
const CarSchema = new mongoose.Schema(
  {
    brand_id: mongoose.Schema.Types.ObjectId,
    model: String,
    detail: Object,
  },
  {
    timestamps: true,
  }
);

// Define a car schema
const CarDetailSchema = new mongoose.Schema(
  {
    car_id: mongoose.Schema.Types.ObjectId,
    detail: Object,
    picture: Array,
  },
  {
    timestamps: true,
  }
);

// Define a car schema
const CarDetailSpecSchema = new mongoose.Schema(
  {
    car_id: mongoose.Schema.Types.ObjectId,
    detail: Object,
  },
  {
    timestamps: true,
  }
);

// Define a home schema
const HomeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "car",
    },
    common: Array,
    recommend_category_cars: Array,
    recommend_cars: Array,
  },
  {
    timestamps: true,
  }
);

// Create a model from the schema
const Home = mongoose.model("home", HomeSchema);
const Brand = mongoose.model("brands", BrandSchema);
const Car = mongoose.model("cars", CarSchema);
const CarDetail = mongoose.model("carDetail", CarDetailSchema);
const CarDetailSpec = mongoose.model("carDetailSpec", CarDetailSpecSchema);

//   craw brand

// mongoose
//   .connect(url, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => {
//     console.log("Connected to MongoDB");

//     const c = new Crawler({
//       maxConnections: 10,
//     //   callback: (error, res, done) => {
//     //     if (error) {
//     //       console.log(error);
//     //     } else {
//     //       const $ = res.$;
//     //     //   $(".brand-filter-item-link img").each(async (i, elem) => {
//     //     //     const src = $(elem).attr("src");
//     //     //     const alt = $(elem).attr("alt");
//     //     //     const brand = { src, alt };

//     //     //     // Check if the brand already exists in the collection
//     //     //     const foundBrand = await Brand.findOne(brand);

//     //     //     // If the brand does not exist, insert it into the collection
//     //     //     if (!foundBrand) {
//     //     //       const newBrand = new Brand(brand);
//     //     //       newBrand
//     //     //         .save()
//     //     //         .then(() => console.log("brand inserted"))
//     //     //         .catch((err) => console.error(err));
//     //     //     }
//     //     //   });

//     //     done();
//     //     }
//     //   },

//     });

//     c.queue("https://www.autofun.vn/xe-oto/audi");
//   });

mongoose
  .connect(url, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to MongoDB");

    // get home
    const homeUrl = `https://www.autofun.vn`;
    const responseHome = await axios.get(homeUrl);
    const handleData = responseHome.data.slice(
      responseHome.data.indexOf("window.__INITIAL_STATE__=") +
        "window.__INITIAL_STATE__=".length,
      responseHome.data.indexOf("}]}</script>") + 3
    );
    const homeData = JSON.parse(handleData);

    for (const brand of homeData.brandRes) {
      const brandData = {
        src: brand.brandIcon,
        alt: brand.brandName,
        id: brand.id,
      };

      // Check if the brand already exists in the collection
      const foundBrand = await Brand.findOne({ id: brandData.id });

      // If the brand does not exist, insert it into the collection
      if (!foundBrand) {
        const newBrand = new Brand(brandData);
        newBrand
          .save()
          .then(() => console.log("brand inserted"))
          .catch((err) => console.error(err));
      }
    }

    await Home.create({
      common: homeData.innerLink.linkGroup.map(
        ({ backLinkList, id, title }) => ({ backLinkList, id, title })
      ),
      new_cars: homeData.newModelRes,
      recommend_category_cars: homeData.recommendModelCategoryRes.map(
        ({ category, carModels }) => ({ category, carModels })
      ),
      recommend_cars: homeData.recommendCars,
    });

    // Get all brands from the collection
    const brands = await Brand.find();

    // Fetch data from each brand's specific URL
    for (const brand of brands) {
      const brandAlt = brand.alt.toLowerCase().replace(/ /g, "-");

      const brandUrl = `https://www.autofun.vn/vn/xe-oto/${brandAlt}/init-data.js`;
      try {
        const response = await axios.get(brandUrl);
        let data = response.data;
        data = data.replace(
          ";(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());",
          ""
        ); // remove the function
        data = data.replace("window.__INITIAL_STATE__=", ""); // remove the assignment
        data = data.trim(); // remove leading and trailing whitespace
        if (data.endsWith(";")) {
          data = data.slice(0, -1); // remove the trailing semicolon
        }

        // Now data should be a JSON string
        const dataParse = JSON.parse(data);
        const brandInfoRes = dataParse.brandInfoRes;

        const pageConfigCollection = dataParse.pageConfigCollection;

        const layoutData = Object.values(pageConfigCollection)[1].layoutData;

        await Brand.findOneAndUpdate(
          {
            _id: brand._id,
          },
          {
            description: brandInfoRes.description,
            id: brandInfoRes.id,
            faq: layoutData.find((item) => item.type === "FaqListConfigurable")
              .data,
            compare: layoutData.find((item) => item.type === "ComparisionList")
              .data,
            info: layoutData.find((item) => item.type === "BrandIntroduction")
              .data.brandInfo,
          }
        );

        const BrandModelList = layoutData.find(
          (item) => item.type === "BrandModelList"
        );

        if (BrandModelList) {
          const carList = BrandModelList.data.brandCarList;
          const models = Object.keys(carList);

          for (let indexCar = 0; indexCar < models.length; indexCar++) {
            const keyModel = models[indexCar];

            if (keyModel === "All") continue;

            const modelsValue = carList[keyModel];

            for (
              let indexModel = 0;
              indexModel < modelsValue.length;
              indexModel++
            ) {
              const model = modelsValue[indexModel];
              const car = await Car.findOneAndUpdate(
                { "detail.id": model.id }, // find a document with these properties
                {
                  brand_id: brand._id,
                  model: keyModel,
                  detail: model,
                }, // update or insert these properties
                { upsert: true, new: true } // create the document if it doesn't exist
              );

              // lấy chi tiết xe
              const carDetailUrl = `https://www.autofun.vn/vn${model.targetHref}/init-data.js`;
              try {
                const responseCarDetail = await axios.get(carDetailUrl);
                let dataCarDetail = responseCarDetail.data;
                dataCarDetail = dataCarDetail.replace(
                  ";(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());",
                  ""
                ); // remove the function
                dataCarDetail = dataCarDetail.replace(
                  "window.__INITIAL_STATE__=",
                  ""
                ); // remove the assignment
                dataCarDetail = dataCarDetail.trim(); // remove leading and trailing whitespace
                if (dataCarDetail.endsWith(";")) {
                  dataCarDetail = dataCarDetail.slice(0, -1); // remove the trailing semicolon
                }

                // Now data should be a JSON string
                const dataCarDetailParse = JSON.parse(dataCarDetail);
                const detail = dataCarDetailParse.modelInfoRes;

                await CarDetail.findOneAndUpdate(
                  { "detail.id": detail.id }, // find a document with these properties
                  {
                    car_id: car._id,
                    detail: detail,
                  }, // update or insert these properties
                  { upsert: true } // create the document if it doesn't exist
                );
              } catch (error) {
                console.error("error", error);
              }

              // thông số kĩ thuật
              const carDetailSpecUrl = `https://www.autofun.vn/vn${model.targetHref}/thong-so-ky-thuat/init-data.js`;
              try {
                const responseCarDetailSpec = await axios.get(carDetailSpecUrl);
                let dataCarDetailSpec = responseCarDetailSpec.data;
                dataCarDetailSpec = dataCarDetailSpec.replace(
                  ";(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());",
                  ""
                ); // remove the function
                dataCarDetailSpec = dataCarDetailSpec.replace(
                  "window.__INITIAL_STATE__=",
                  ""
                ); // remove the assignment
                dataCarDetailSpec = dataCarDetailSpec.trim(); // remove leading and trailing whitespace
                if (dataCarDetailSpec.endsWith(";")) {
                  dataCarDetailSpec = dataCarDetailSpec.slice(0, -1); // remove the trailing semicolon
                }

                // Now data should be a JSON string
                const dataCarDetailSpecParse = JSON.parse(dataCarDetailSpec);
                const detailSpec = {
                  catalog: dataCarDetailSpecParse.catalog,
                  specs: dataCarDetailSpecParse.modelVariantsSpecs,
                };

                await CarDetailSpec.findOneAndUpdate(
                  { car_id: car._id }, // find a document with these properties
                  {
                    car_id: car._id,
                    detail: detailSpec,
                  }, // update or insert these properties
                  { upsert: true } // create the document if it doesn't exist
                );
              } catch (error) {
                console.error("error", error);
              }

              // Hình ảnh
              const carDetailImagesUrl = `https://www.autofun.vn/vn${model.targetHref}/hinh-anh/init-data.js`;
              try {
                const responseCarDetailImagesSpec = await axios.get(
                  carDetailImagesUrl
                );
                let dataCarDetailImages = responseCarDetailImagesSpec.data;
                dataCarDetailImages = dataCarDetailImages.replace(
                  ";(function(){var s;(s=document.currentScript||document.scripts[document.scripts.length-1]).parentNode.removeChild(s);}());",
                  ""
                ); // remove the function
                dataCarDetailImages = dataCarDetailImages.replace(
                  "window.__INITIAL_STATE__=",
                  ""
                ); // remove the assignment
                dataCarDetailImages = dataCarDetailImages.trim(); // remove leading and trailing whitespace
                if (dataCarDetailImages.endsWith(";")) {
                  dataCarDetailImages = dataCarDetailImages.slice(0, -1); // remove the trailing semicolon
                }

                // Now data should be a JSON string
                const dataCarDetailImagesParse =
                  JSON.parse(dataCarDetailImages);

                await CarDetail.findOneAndUpdate(
                  { car_id: car._id }, // find a document with these properties
                  {
                    car_id: car._id,
                    picture: dataCarDetailImagesParse.carPicRes.map((item) => ({
                      categoryName: item.categoryName,
                      imageCount: item.imageCount,
                      imageList: item.imageList,
                    })),
                  }, // update or insert these properties
                  { upsert: true } // create the document if it doesn't exist
                );
              } catch (error) {
                console.error("error", error);
              }
            }
          }
        }
      } catch (error) {
        console.error(error);
      }
    }

    console.log("All brands have been processed.");
  });
